/**
 * `intentset evidence import` (Core §8): a test runner's report turned into
 * run records bound to this repository's snapshot. A verification's
 * `selector` is matched against each test's full title, and every
 * verification whose selector no test matched is listed, since it gets no
 * record from this run and reads as missing. Evidence must name the commit
 * it ran at, so an unknown commit refuses. Writes the one file `--out` names,
 * and never over an existing one: earlier records are history.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compareStrings } from "@intentset/core";
import { type ParsedRun, isUtcTimestamp, parseNodeTap, parseVitestJson, toRunRecords } from "@intentset/verification";
import { count, type Io } from "../output.ts";
import { outputProblem } from "../outputs.ts";
import type { Session } from "../session.ts";

export const REPORTERS = {
  vitest: { tool: "vitest", parse: (text: string) => parseVitestJson(JSON.parse(text)) },
  "node-tap": { tool: "node:test", parse: (text: string) => parseNodeTap(text) },
} as const;

export interface EvidenceImportOptions {
  from?: string;
  report?: string;
  out?: string;
  product?: string;
  release?: string;
  environment?: string;
  startedAt?: string;
  finishedAt?: string;
  uriBase?: string;
  toolVersion?: string;
}

const URI = /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/;

/** Problems that need no repository, so a typo costs nothing. */
export function evidenceUsageProblem(options: EvidenceImportOptions): string | null {
  if (options.from === undefined || !Object.hasOwn(REPORTERS, options.from)) {
    return `--from ${options.from ?? "(missing)"}: the reporters are ${Object.keys(REPORTERS).join(" and ")}`;
  }
  if (options.report === undefined) return "a report file is required: evidence import --from <reporter> <report>";
  for (const [flag, value] of [
    ["--out", options.out],
    ["--product", options.product],
    ["--release", options.release],
  ] as const) {
    if (value === undefined || value === "") return `${flag} is required`;
  }
  for (const [flag, value] of [
    ["--started-at", options.startedAt],
    ["--finished-at", options.finishedAt],
  ] as const) {
    if (value !== undefined && !isUtcTimestamp(value)) {
      return `${flag} ${value}: give a UTC time such as 2026-10-02T12:00:00Z`;
    }
  }
  if (options.uriBase !== undefined && !URI.test(options.uriBase)) {
    return `--uri-base ${options.uriBase}: give a URI with a scheme, such as https://ci.example/runs/42`;
  }
  if (options.environment !== undefined && options.environment.trim() === "") return "--environment is empty";
  return null;
}

export function evidenceImportCommand(session: Session, options: EvidenceImportOptions, io: Io): number {
  const fail = (message: string) => {
    io.stderr(`intentset evidence import: ${message}\n`);
    return 2;
  };
  const { repo, snapshot, result } = session;
  const graph = result.graph;
  const reporter = REPORTERS[options.from as keyof typeof REPORTERS];
  const product = options.product as string;
  const release = options.release as string;

  if (snapshot.commit === null) {
    return fail(`evidence must name the commit it ran at, and none could be read: ${snapshot.commitUnavailable}`);
  }
  if (snapshot.uncommitted === true) {
    return fail(
      `tracked files differ from commit ${snapshot.commit}, so records bound to it would name a commit the run did not test; commit first (Core §8).`,
    );
  }
  if (graph.artifacts.get(product)?.meta.type !== "product") {
    return fail(`--product ${product} is not a product in this graph.`);
  }
  if (repo.registries.releases.length > 0 && !repo.registries.releases.includes(release)) {
    return fail(`--release ${release} is not a release in the registries; labels match exactly (Core §7).`);
  }

  const reportFile = resolve(io.cwd, options.report as string);
  let parsed: ParsedRun;
  let modified: string;
  try {
    modified = statSync(reportFile).mtime.toISOString();
    parsed = reporter.parse(readFileSync(reportFile, "utf8"));
  } catch (error) {
    return fail(`could not read ${options.report} as ${options.from} output: ${(error as Error).message}`);
  }

  const target = resolve(io.cwd, options.out as string);
  const problem = outputProblem(repo, target);
  if (problem !== null) return fail(`--out ${options.out} ${problem}; nothing was written.`);
  if (existsSync(target)) {
    return fail(`--out ${options.out} exists; run records are history, so import into a new file.`);
  }

  // Selector -> verification, from the automated verifications that are not retired, first ID winning a shared selector.
  const verifications = new Map<string, string>();
  const shared: string[] = [];
  for (const id of [...graph.artifacts.keys()].sort(compareStrings)) {
    const meta = graph.artifacts.get(id)?.meta;
    if (meta?.type !== "verification" || meta.status === "retired" || meta.verification?.method !== "automated")
      continue;
    const selector = meta.verification.selector;
    if (verifications.has(selector)) shared.push(`${selector} (${verifications.get(selector)} and ${id})`);
    else verifications.set(selector, id);
  }

  const startedAt = options.startedAt ?? modified;
  const finishedAt = options.finishedAt ?? modified;
  let converted: ReturnType<typeof toRunRecords>;
  try {
    converted = toRunRecords(parsed, {
      verifications,
      commit: snapshot.commit,
      graphHash: snapshot.graphHash,
      environment: options.environment ?? "local",
      scope: { product, release },
      tool: { name: reporter.tool, version: options.toolVersion ?? "unknown" },
      startedAt,
      finishedAt,
      uriBase: options.uriBase ?? pathToFileURL(reportFile).href,
    });
  } catch (error) {
    return fail((error as Error).message);
  }
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(converted.records, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    return fail(`could not write ${options.out}: ${(error as Error).message}`);
  }

  const lines = [
    `Imported ${count(converted.records.length, "run record")} from ${options.report} (${options.from}, ${count(parsed.tests.length, "test")}) into ${options.out}`,
    `  bound to commit ${snapshot.commit}, graph ${snapshot.graphHash}, for ${product} ${release}, environment ${options.environment ?? "local"}`,
  ];
  if (options.startedAt === undefined || options.finishedAt === undefined) {
    lines.push(
      `  timestamps: the report file's modification time, ${modified}, stands in for the run's ` +
        `${options.startedAt === undefined && options.finishedAt === undefined ? "start and finish" : options.startedAt === undefined ? "start" : "finish"}; ` +
        "pass --started-at and --finished-at to record the run's own",
    );
  }
  for (const record of converted.records) {
    lines.push(`  ${record.verificationId}  ${record.result}  ${record.rationale ?? ""}`.trimEnd());
  }
  lines.push(
    `Unmatched selectors (${converted.unmatched.length}): ${converted.unmatched.length === 0 ? "none" : "no test title carries them, so their verifications get no record from this run and read as missing"}`,
    ...converted.unmatched.map((selector) => `  - ${selector} (${verifications.get(selector)})`),
  );
  if (shared.length > 0) {
    lines.push(`Selectors shared by two verifications, matched to the first only (${shared.length}):`);
    lines.push(...shared.map((item) => `  - ${item}`));
  }
  if (parsed.problems.length > 0) {
    lines.push(`Problems in the report that no test title carries (${parsed.problems.length}):`);
    lines.push(...parsed.problems.map((item) => `  - ${item}`));
  }
  if (!result.ok) {
    lines.push(
      `Validation has ${count(session.errors, "error")}; the records are bound to that graph. Run \`intentset validate\`.`,
    );
  }
  io.stdout(`${lines.join("\n")}\n`);
  return result.ok ? 0 : 1;
}
