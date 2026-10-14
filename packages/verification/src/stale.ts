/**
 * What needs a run (ADR 0013, "Slow suites"): the automated verifications
 * whose evidence at the snapshot is not a current pass, grouped for a person
 * and written as the arguments a test runner takes to run just those tests.
 * Selection reads a classification and changes nothing; the runner formats are
 * strings and know nothing of the repository.
 *
 * A selector is matched by Intentset as a whole token (`selectorMatches`); a
 * runner's own `--grep` or `-t` is a regular expression that matches a
 * substring of a title. The arguments here therefore select every test the
 * token rule would, and possibly a few more (a selector that is a prefix of
 * another's), never fewer.
 */
import type { Graph } from "@intentset/core";
import { type Classification, EVIDENCE_STATUSES, type EvidenceStatus } from "./classify.ts";
import { compareStrings } from "./diagnostic.ts";

/** The statuses that mean a run is needed: everything but a current pass. */
export const NEEDS_RUN = EVIDENCE_STATUSES.filter((status) => status !== "current-pass");
export type NeedsRun = Exclude<EvidenceStatus, "current-pass">;

export interface StaleEntry {
  verification: string;
  selector: string;
  locator: string;
  status: NeedsRun;
  /** The note that names what moved, for the statuses where it says something a reader needs. */
  note?: string;
}

export interface ManualEntry {
  verification: string;
  locator: string;
  status: NeedsRun;
  note?: string;
}

export interface StaleCounts {
  /** Automated verifications that are not retired. */
  automated: number;
  /** Of those, the ones with a current pass. */
  current: number;
  /** Of those, the ones that need a run: the sum of `byStatus`. */
  needRun: number;
  byStatus: Record<NeedsRun, number>;
  /** Manual verifications without a current review, which no runner re-runs. */
  manual: number;
}

export interface StaleReport {
  needRun: StaleEntry[];
  manual: ManualEntry[];
  counts: StaleCounts;
}

/** The statuses whose note says why or what moved; for the others the note only says how a pass was judged. */
const NOTED: ReadonlySet<EvidenceStatus> = new Set(["stale", "missing", "unresolved"]);

/** Every verification that is not retired, split by method, with those not currently passing listed and counted. */
export function staleReport(graph: Graph, classification: Classification): StaleReport {
  const needRun: StaleEntry[] = [];
  const manual: ManualEntry[] = [];
  const byStatus = Object.fromEntries(NEEDS_RUN.map((status) => [status, 0])) as Record<NeedsRun, number>;
  let automated = 0;
  for (const [id, evidence] of Object.entries(classification.verifications)) {
    const meta = graph.artifacts.get(id)?.meta;
    if (meta?.type !== "verification" || meta.status === "retired" || meta.verification === undefined) continue;
    const { locator, selector } = meta.verification;
    const note = NOTED.has(evidence.status) && evidence.note !== undefined ? { note: evidence.note } : {};
    if (meta.verification.method === "manual") {
      if (evidence.status !== "current-pass") {
        manual.push({ verification: id, locator, status: evidence.status as NeedsRun, ...note });
      }
      continue;
    }
    automated++;
    if (evidence.status === "current-pass") continue;
    byStatus[evidence.status as NeedsRun]++;
    needRun.push({ verification: id, selector, locator, status: evidence.status as NeedsRun, ...note });
  }
  needRun.sort(
    (a, b) =>
      compareStrings(a.locator, b.locator) ||
      compareStrings(a.selector, b.selector) ||
      compareStrings(a.verification, b.verification),
  );
  manual.sort((a, b) => compareStrings(a.locator, b.locator) || compareStrings(a.verification, b.verification));
  return {
    needRun,
    manual,
    counts: {
      automated,
      current: automated - needRun.length,
      needRun: needRun.length,
      byStatus,
      manual: manual.length,
    },
  };
}

/** "3 of 12 automated verifications need a run: stale 2, missing 1." */
export function staleSummary(counts: StaleCounts): string {
  const parts = NEEDS_RUN.filter((status) => counts.byStatus[status] > 0).map(
    (status) => `${status} ${counts.byStatus[status]}`,
  );
  const manual =
    counts.manual === 0
      ? ""
      : ` ${counts.manual} manual verification${counts.manual === 1 ? " has" : "s have"} no current review, which a runner does not re-run.`;
  return `${counts.needRun} of ${counts.automated} automated verification${counts.automated === 1 ? "" : "s"} need a run${parts.length === 0 ? "" : `: ${parts.join(", ")}`}.${manual}`;
}

export const RUNNER_FORMATS = ["playwright", "vitest", "node-test"] as const;
export type RunnerFormat = (typeof RUNNER_FORMATS)[number];

/** A string as a JavaScript regular expression matching it literally; `/` is escaped so a pattern never reads as `/re/flags`. */
export function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

/** The same, for a file filter that is a regular expression but reads as a path: a dot stays a dot, which only matches more. */
function pathPattern(path: string): string {
  return path.replace(/[\\^$*+?()[\]{}|]/g, "\\$&");
}

const PLAIN = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** One word for a POSIX shell: as it is when nothing in it is special, else in single quotes with each `'` closed, escaped and reopened. */
export function shellQuote(text: string): string {
  if (PLAIN.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

const unique = (values: string[]) => [...new Set(values)].sort(compareStrings);

/**
 * The arguments that run just these tests, on one line to paste after the runner's own command (`playwright test`,
 * `vitest run`, `node --test`). Empty when there is nothing to run. Selectors are sorted and unique; the locator
 * files are the ones the entries name.
 */
export function runnerArguments(
  format: RunnerFormat,
  entries: readonly Pick<StaleEntry, "selector" | "locator">[],
): string {
  if (entries.length === 0) return "";
  const selectors = unique(entries.map((entry) => entry.selector));
  const files = unique(entries.map((entry) => entry.locator));
  const alternation = selectors.map(escapeRegExp).join("|");
  switch (format) {
    case "playwright":
      return ["--grep", shellQuote(alternation), ...files.map((file) => shellQuote(pathPattern(file)))].join(" ");
    case "vitest":
      return [...files.map(shellQuote), "-t", shellQuote(alternation)].join(" ");
    case "node-test":
      return [
        ...selectors.map((selector) => `--test-name-pattern=${shellQuote(escapeRegExp(selector))}`),
        ...files.map(shellQuote),
      ].join(" ");
  }
}
