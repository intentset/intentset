/**
 * `intentset evidence stale` (ADR 0013, "Slow suites"): the automated
 * verifications whose evidence at this snapshot is not a current pass, as a
 * table, as JSON, or as the arguments a test runner takes to run just those
 * tests. Subject binding says exactly which records went stale, so a slow suite
 * runs what a change could have moved and not everything. A person's review is
 * not something a runner re-runs, so manual verifications are listed apart.
 * Never writes. Exit 0 whatever it finds, 1 with --check when an automated
 * verification needs a run, 2 for an invocation or tool failure.
 */
import { compareStrings } from "@intentset/core";
import {
  RUNNER_FORMATS,
  type RunnerFormat,
  runnerArguments,
  type StaleEntry,
  type StaleReport,
  staleReport,
  staleSummary,
} from "@intentset/verification";
import { count, type Io, json, snapshotLine } from "../output.ts";
import type { Session } from "../session.ts";
import { parseRelease } from "./graph.ts";

export const STALE_FORMATS = ["list", "json", ...RUNNER_FORMATS] as const;
export type StaleFormat = (typeof STALE_FORMATS)[number];

export interface EvidenceStaleOptions {
  /** `<product>:<label>`, the scope evidence is assessed for. */
  release?: string;
  format?: string;
  check: boolean;
  json: boolean;
}

/** Problems that need no repository, so a typo costs nothing. Returns the format on success. */
export function evidenceStaleUsageProblem(
  options: EvidenceStaleOptions,
): { problem: string } | { format: StaleFormat } {
  const format = options.format ?? (options.json ? "json" : "list");
  if (!(STALE_FORMATS as readonly string[]).includes(format)) {
    return { problem: `--format ${format}: the formats are ${STALE_FORMATS.join(", ")}` };
  }
  if (options.json && format !== "json") {
    return { problem: `--json is --format json; it does not combine with --format ${format}` };
  }
  if (options.release !== undefined && parseRelease(options.release) === null) {
    return {
      problem: `--release ${options.release}: give a product and a release label as <product>:<label>, such as PRD-LANTERN:pilot-1`,
    };
  }
  return { format: format as StaleFormat };
}

export function evidenceStaleCommand(
  session: Session,
  format: StaleFormat,
  options: EvidenceStaleOptions,
  io: Io,
): number {
  const evidence = session.evidence;
  if (evidence === undefined) {
    io.stderr("intentset evidence stale: run records were not read; evidence is judged at L3 and above.\n");
    return 2;
  }
  const release = options.release === undefined ? null : parseRelease(options.release);
  if (release !== null && session.result.graph.artifacts.get(release.product)?.meta.type !== "product") {
    io.stderr(`intentset evidence stale: --release names ${release.product}, which is not a product in this graph.\n`);
    return 2;
  }

  const report = staleReport(session.result.graph, evidence.check.classification);
  const summary = staleSummary(report.counts);

  if (format === "json") {
    io.stdout(
      json({
        snapshot: session.snapshot,
        binding: evidence.binding.binding,
        needRun: report.needRun,
        manual: report.manual,
        counts: report.counts,
      }),
    );
  } else if (format === "list") {
    io.stdout(renderList(session, report, summary));
  } else {
    // One line to paste or capture; the reading goes to stderr so `$(...)` holds only the arguments.
    io.stdout(`${runnerArguments(format as RunnerFormat, report.needRun)}\n`);
    io.stderr(`${summary}\n`);
  }
  for (const line of cautions(session)) io.stderr(`${line}\n`);
  return options.check && report.counts.needRun > 0 ? 1 : 0;
}

/** What a reader should know before trusting a short list, said on stderr so it never lands in a captured line. */
function cautions(session: Session): string[] {
  const lines: string[] = [];
  if (session.evidence !== undefined && session.evidence.records === 0) {
    lines.push(
      "intentset evidence stale: no run records were read, so every automated verification reads as missing; give --evidence <file>, or import a run into .intentset/evidence/.",
    );
  }
  const other = session.diagnostics.filter((d) => d.severity === "error" && d.origin !== "evidence").length;
  if (other > 0) {
    lines.push(
      `intentset evidence stale: the graph has ${count(other, "validation error")}, so it may be incomplete; run \`intentset validate\`.`,
    );
  }
  return lines;
}

function renderList(session: Session, report: StaleReport, summary: string): string {
  const evidence = session.evidence;
  const lines = [snapshotLine(session.snapshot)];
  if (evidence !== undefined) {
    const why =
      evidence.binding.reason === "default"
        ? " (the default, since slices claim files)"
        : evidence.binding.reason === "no-slices"
          ? ", because no slice claims files"
          : ", as configured";
    lines.push(`Binding: ${evidence.binding.binding}${why}`);
  }
  lines.push("");

  const byFile = new Map<string, StaleEntry[]>();
  for (const entry of report.needRun) byFile.set(entry.locator, [...(byFile.get(entry.locator) ?? []), entry]);
  if (byFile.size === 0) lines.push("Nothing automated needs a run.", "");
  for (const file of [...byFile.keys()].sort(compareStrings)) {
    lines.push(file);
    const entries = byFile.get(file) as StaleEntry[];
    const width = Math.max(...entries.map((entry) => entry.status.length));
    for (const entry of entries) {
      lines.push(`  ${entry.status.padEnd(width)}  ${entry.selector}  ${entry.verification}`);
      if (entry.note !== undefined) lines.push(`    ${entry.note}`);
    }
    lines.push("");
  }

  if (report.manual.length > 0) {
    lines.push(`Manual, not re-run by a runner (${report.manual.length}):`);
    for (const entry of report.manual) {
      lines.push(`  ${entry.verification}  ${entry.status}  ${entry.locator}`);
      if (entry.note !== undefined) lines.push(`    ${entry.note}`);
    }
    lines.push("");
  }
  lines.push(summary);
  return `${lines.join("\n")}\n`;
}
