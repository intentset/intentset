import { writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, paginateScan } from "@aws-sdk/lib-dynamodb";
import { retentionDays } from "../functions/ask/limits.ts";
import {
  defaultExcludePrefixes,
  fromItem,
  type ReportInput,
  renderGaps,
  renderReport,
  type StoredQuestion,
  select,
} from "./report.ts";

/**
 * `pnpm run questions:report [--days N] [--out FILE] [--gaps] [--exclude-prefix P ...] [--table T] [--profile P]`
 * (BEH-QUESTIONS-REPORT). Reads the questions table, read-only, and writes the report, or with `--gaps` the brief an
 * agent drafts knowledge from, to stdout or FILE. Credentials come from the default chain; with neither AWS_PROFILE
 * nor keys in the environment it uses the `coral-reef` profile. Without access it says so in one line, writes
 * nothing and exits 1.
 */

const usage = `usage: pnpm run questions:report [--days N] [--out FILE] [--gaps] [--exclude-prefix PREFIX ...]
  --days N              the last N days, 1 to ${retentionDays} (default 30)
  --out FILE            write to FILE instead of stdout; never inside the repository, which is public
  --gaps                write the brief an agent drafts knowledge records from, instead of the report
  --exclude-prefix P    leave out conversations whose id starts with P; repeatable, and replaces the default
                        (${defaultExcludePrefixes.join(", ")}); --exclude-prefix "" leaves nothing out
  --table T             the table (default intentset-ask-questions)
  --region R            its Region (default us-east-2)
  --profile P           the AWS profile (default AWS_PROFILE, else coral-reef unless keys are in the environment)`;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function fail(message: string): never {
  process.stderr.write(`questions report: ${message}\n`);
  process.exit(1);
}

let args: ReturnType<typeof parse>;
function parse() {
  // pnpm passes a separating "--" through to the script.
  return parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      days: { type: "string", default: "30" },
      out: { type: "string" },
      gaps: { type: "boolean", default: false },
      "exclude-prefix": { type: "string", multiple: true },
      table: { type: "string", default: "intentset-ask-questions" },
      region: { type: "string", default: "us-east-2" },
      profile: { type: "string" },
      help: { type: "boolean", default: false },
    },
  }).values;
}
try {
  args = parse();
} catch (error) {
  fail(`${(error as Error).message}\n${usage}`);
}
if (args.help) {
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}

const days = Number(args.days);
if (!Number.isInteger(days) || days < 1 || days > retentionDays) fail(`--days must be 1 to ${retentionDays}`);
const excludePrefixes = (args["exclude-prefix"] ?? [...defaultExcludePrefixes]).filter((p) => p !== "");
const table = args.table;

let outPath: string | null = null;
if (args.out !== undefined) {
  outPath = resolve(args.out);
  const inside = relative(repositoryRoot, outPath);
  if (!inside.startsWith("..") && !inside.startsWith("/")) {
    process.stderr.write(
      `questions report: warning: ${inside} is inside the repository, which is public; the questions are visitor data, so never commit it\n`,
    );
  }
}

if (args.profile) process.env.AWS_PROFILE = args.profile;
else if (!process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) process.env.AWS_PROFILE = "coral-reef";

const to = new Date();
const window = { from: new Date(to.getTime() - days * 86_400_000), to };

// Read everything first: a report is written whole or not at all. The table holds at most 90 days of questions, so
// a scan filtered on the window is the whole read.
const items: StoredQuestion[] = [];
try {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: args.region }));
  const pages = paginateScan(
    { client },
    {
      TableName: table,
      FilterExpression: "askedAt >= :from",
      ExpressionAttributeValues: { ":from": window.from.toISOString() },
    },
  );
  for await (const page of pages) for (const item of page.Items ?? []) items.push(fromItem(item));
} catch (error) {
  const name = (error as Error).name || "Error";
  fail(
    `cannot read ${table} in ${args.region} as ${process.env.AWS_PROFILE ?? "the environment's credentials"} (${name}); nothing was read`,
  );
}

const input: ReportInput = { window, selection: select(items, window, excludePrefixes), table, excludePrefixes };
const text = args.gaps ? renderGaps(input) : renderReport(input);
if (outPath === null) process.stdout.write(text);
else {
  writeFileSync(outPath, text);
  process.stderr.write(`questions report: wrote ${outPath}\n`);
}
