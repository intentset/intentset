/**
 * From a test runner's results to run records. A verification's `selector`
 * is matched against each test's full title; no test API is invented for it
 * (no `describe.behavior`). The parsers in node-test.ts and vitest.ts reduce
 * their runner's output to `ParsedRun`, and `toRunRecords` does the rest.
 */
import { sha256Hex } from "@intentset/core";
import { compareStrings } from "../diagnostic.ts";
import { readRunRecords, type RunRecord, type RunResult, type RunScope, type RunTool } from "../records.ts";

export interface ParsedTest {
  /** Ancestor titles and the test's own, joined with " > " (Vitest's own `fullName` when it gives one). */
  fullName: string;
  result: RunResult;
  durationMs: number | null;
}

export interface ParsedRun {
  tests: ParsedTest[];
  /** Failures the output reports but no test title carries, such as a file that failed to load. */
  problems: string[];
}

export interface ToRunRecordsOptions {
  /** Selector -> verification ID, from the graph's automated verifications. */
  verifications: ReadonlyMap<string, string>;
  commit: string;
  graphHash: string;
  environment: string;
  scope: RunScope;
  tool: RunTool;
  /** UTC timestamps of the whole run. */
  startedAt: string;
  finishedAt: string;
  /** Where the run's report lives; each record's uri is this plus `#` and the verification ID. */
  uriBase: string;
}

export interface ConvertedRun {
  /** One record per verification at least one test matched, by verification ID. */
  records: RunRecord[];
  /** Selectors no test matched, sorted: their verifications get no record from this run, and read as missing. */
  unmatched: string[];
}

const SEVERITY: Record<RunResult, number> = { pass: 0, skip: 1, error: 2, fail: 3 };
const WORD = /[A-Za-z0-9_-]/;

/**
 * A selector matches a title when it occurs in it as a whole token: the
 * characters either side are not letters, digits, `_` or `-`. So
 * `schedule-review-v1` matches `schedule [schedule-review-v1] accepts` and a
 * title holding the bracketed tag, but `review-v1` does not match it.
 */
export function selectorMatches(selector: string, title: string): boolean {
  if (selector === "") return false;
  const startsWord = WORD.test(selector[0]);
  const endsWord = WORD.test(selector[selector.length - 1]);
  for (let at = title.indexOf(selector); at !== -1; at = title.indexOf(selector, at + 1)) {
    const before = at === 0 ? "" : title[at - 1];
    const after = title[at + selector.length] ?? "";
    if ((!startsWord || before === "" || !WORD.test(before)) && (!endsWord || after === "" || !WORD.test(after))) {
      return true;
    }
  }
  return false;
}

/** `EV-` and the first 16 hex digits of SHA-256 over the verification ID, commit, graph hash and end time, newline-joined. */
export function deriveEvidenceId(
  verificationId: string,
  commit: string,
  graphHash: string,
  finishedAt: string,
): string {
  return `EV-${sha256Hex([verificationId, commit, graphHash, finishedAt].join("\n")).slice(0, 16)}`;
}

/** The worse of two results: fail, then error, then skip, then pass. */
export function worst(a: RunResult, b: RunResult): RunResult {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/**
 * One run record per verification whose selector matched at least one test.
 * Several matching tests make one record with the worst result and a
 * rationale that counts them. Throws when the options would make a malformed
 * record, since that is a caller's mistake rather than evidence.
 */
export function toRunRecords(parsed: ParsedRun, options: ToRunRecordsOptions): ConvertedRun {
  const matched = new Map<string, { selectors: Set<string>; tests: Set<number> }>();
  const unmatched: string[] = [];
  for (const selector of [...options.verifications.keys()].sort(compareStrings)) {
    const verificationId = options.verifications.get(selector) as string;
    const hits = parsed.tests.flatMap((test, index) => (selectorMatches(selector, test.fullName) ? [index] : []));
    if (hits.length === 0) {
      unmatched.push(selector);
      continue;
    }
    const entry = matched.get(verificationId) ?? { selectors: new Set<string>(), tests: new Set<number>() };
    entry.selectors.add(selector);
    for (const hit of hits) entry.tests.add(hit);
    matched.set(verificationId, entry);
  }

  const records: RunRecord[] = [];
  for (const verificationId of [...matched.keys()].sort(compareStrings)) {
    const { selectors, tests } = matched.get(verificationId) as { selectors: Set<string>; tests: Set<number> };
    const results = [...tests].sort((a, b) => a - b).map((index) => parsed.tests[index].result);
    const result = results.reduce(worst, "pass" as RunResult);
    const counts = (["pass", "fail", "error", "skip"] as const)
      .map((r) => [r, results.filter((x) => x === r).length] as const)
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `${n} ${r}`)
      .join(", ");
    const names = [...selectors].sort(compareStrings).join(", ");
    records.push({
      evidenceId: deriveEvidenceId(verificationId, options.commit, options.graphHash, options.finishedAt),
      verificationId,
      commit: options.commit,
      graphHash: options.graphHash,
      environment: options.environment,
      scope: { product: options.scope.product, release: options.scope.release },
      tool: { name: options.tool.name, version: options.tool.version },
      reviewer: null,
      startedAt: options.startedAt,
      finishedAt: options.finishedAt,
      result,
      uri: `${options.uriBase}#${encodeURIComponent(verificationId)}`,
      rationale: `${results.length} test${results.length === 1 ? "" : "s"} matched ${names}: ${counts}.`,
    });
  }

  const check = readRunRecords(records, "adapter output");
  if (check.diagnostics.length > 0) {
    throw new Error(`toRunRecords was given options that make malformed records: ${check.diagnostics[0].message}`);
  }
  return { records, unmatched };
}
