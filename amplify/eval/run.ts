/**
 * The chat's eval (SLICE-ASK): every question in questions.json through the function's own answer flow, `ask()`,
 * with the model the function uses, `bedrockModel()`, against the corpus `pnpm run corpus` built from this commit.
 * The store is the tests' in-memory one, so nothing is written to DynamoDB and the day's budget and counts are
 * untouched. Prints a pass/fail table and the estimated cost, and exits 1 on any failure.
 *
 * Run it before any change to the prompt, the model or limits.ts's model, and put the table in the pull request:
 *
 *   pnpm run chat:eval                 (builds the corpus first; AWS profile coral-reef unless AWS_PROFILE is set)
 *   pnpm run chat:eval -- --only drift-gate,contact
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type AskEvent, ask } from "../functions/ask/answer.ts";
import { checkCorpus } from "../functions/ask/corpus.ts";
import { model as modelConfig, pricePerMillion } from "../functions/ask/limits.ts";
import { bedrockModel, type Model, type ModelResult } from "../functions/ask/model.ts";
import { MemoryStore } from "../test/memory-store.ts";
import { type EvalAnswer, type EvalQuestion, judge, origin, readQuestions, unknownSources } from "./judge.ts";

const here = import.meta.dirname;
const { values } = parseArgs({ options: { only: { type: "string" }, concurrency: { type: "string" } } });

process.env.AWS_PROFILE ??= "coral-reef";

const corpus = checkCorpus(JSON.parse(await readFile(join(here, "..", "functions", "ask", "corpus.json"), "utf8")));
let questions = readQuestions(JSON.parse(await readFile(join(here, "questions.json"), "utf8")));
const unknown = unknownSources(questions, corpus);
if (unknown.length > 0) {
  console.error(`The corpus has no document at:\n  ${unknown.join("\n  ")}`);
  process.exit(2);
}
if (values.only) {
  const only = new Set(values.only.split(","));
  questions = questions.filter((q) => only.has(q.id));
}
const base = origin(corpus);

interface Row {
  question: EvalQuestion;
  answer: EvalAnswer;
  problems: string[];
  costMicros: number;
  usage: ModelResult["usage"];
}

/** Why a model call failed. The eval's own console, not the function's log, so the message may be shown. */
function failure(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return typeof status === "number" ? `${status} ${text}` : text;
}

const model = bedrockModel();

/** One question, as a visitor's first: its own store, so no limit of one question touches another. */
async function run(question: EvalQuestion, n: number): Promise<Row> {
  let result: ModelResult | null = null;
  let error: string | undefined;
  const counted: Model = async (request, onEvent) => {
    try {
      result = await model(request, onEvent);
    } catch (e) {
      error = failure(e);
      throw e;
    }
    return result;
  };
  const events: AskEvent[] = [];
  const store = new MemoryStore();
  await ask(
    JSON.stringify({ conversationId: `eval-${question.id}`.slice(0, 64), question: question.question, history: [] }),
    `198.51.100.${n % 250}`,
    { store, model: counted, corpus, now: () => new Date(), newId: randomUUID },
    (event) => events.push(event),
  );
  const record = store.questions[0];
  const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
  const refused = events.find((e) => e.type === "refused" || e.type === "error");
  const answer: EvalAnswer = {
    outcome: record?.outcome ?? (refused ? `${refused.type}:${refused.reason}` : "none"),
    sources: record?.sources ?? [],
    text,
  };
  const usage = (result as ModelResult | null)?.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const problems = judge(question, answer, base);
  if (error !== undefined) problems.push(`the model call failed (${error})`);
  return { question, answer, problems, costMicros: record?.costMicros ?? 0, usage };
}

// ask() logs an event kind, ids and counts per answer; the table says the same, so those lines are dropped.
const print = console.log;
console.log = () => {};
print(
  `${questions.length} questions · ${modelConfig.id} in ${modelConfig.region} · corpus ${corpus.hash.slice(0, 12)} (${corpus.documents.length} documents)\n`,
);
const rows: Row[] = [];
// The first question writes the cached prefix; the rest read it, a few at a time.
const width = Math.max(1, Number(values.concurrency ?? 4));
if (questions.length > 0) rows.push(await run(questions[0], 0));
for (let i = 1; i < questions.length; i += width) {
  rows.push(...(await Promise.all(questions.slice(i, i + width).map((q, j) => run(q, i + j)))));
}
console.log = print;

const path = (url: string) => (url.startsWith(base) ? url.slice(base.length) : url);
const table = [
  ["", "id", "topic", "outcome", "cited", "cost"],
  ...rows.map((r) => [
    r.problems.length === 0 ? "pass" : "FAIL",
    r.question.id,
    r.question.topic,
    r.answer.outcome,
    r.answer.sources.map(path).join(" ") || "-",
    `$${(r.costMicros / 1e6).toFixed(4)}`,
  ]),
];
const widths = table[0].map((_, c) => Math.max(...table.map((row) => row[c].length)));
for (const row of table) console.log(row.map((cell, c) => cell.padEnd(widths[c])).join("  "));

const failed = rows.filter((r) => r.problems.length > 0);
for (const r of failed) {
  console.log(`\n${r.question.id}: ${r.problems.join("; ")}`);
  console.log(`  Q: ${r.question.question}`);
  console.log(`  A: ${r.answer.text.replace(/\s+/g, " ").slice(0, 400)}`);
}
const total = rows.reduce((n, r) => n + r.costMicros, 0) / 1e6;
const tokens = rows.reduce(
  (t, r) => ({
    input: t.input + r.usage.input,
    output: t.output + r.usage.output,
    cacheRead: t.cacheRead + r.usage.cacheRead,
    cacheWrite: t.cacheWrite + r.usage.cacheWrite,
  }),
  { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
);
console.log(
  `\n${rows.length - failed.length}/${rows.length} passed · estimated cost $${total.toFixed(4)} at $${pricePerMillion.input}/$${pricePerMillion.output} per million in/out` +
    ` · tokens: ${tokens.input} in, ${tokens.output} out, ${tokens.cacheRead} cache read, ${tokens.cacheWrite} cache write`,
);
process.exit(failed.length === 0 ? 0 : 1);
