/**
 * `intentset graph --format json` (spec/export.md, Core §12): the
 * `intentset/export/0.3` envelope over the validated repository, with the
 * report sections `--report` asks for. Printed to stdout, or written to the
 * one file `--out` names, which may not be any file the repository reads.
 * A failing validation still exports, with `validation.status: "fail"`, and
 * exits 1. Restricted artifacts are withheld unless `--include-restricted`.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ownershipReport } from "@intentset/architecture";
import {
  EXPORT_REPORTS,
  type ExportReportName,
  type ExportReports,
  ID_PATTERN,
  LEVELS,
  type Level,
  exportGraph,
  impactReport,
} from "@intentset/core";
import { knowledgeReport } from "@intentset/publisher";
import { evidenceReport } from "@intentset/verification";
import type { Io } from "../output.ts";
import { outputProblem } from "../outputs.ts";
import type { Session } from "../session.ts";

export interface GraphOptions {
  format?: string;
  includeBodies: boolean;
  release?: string;
  out?: string;
  generatedAt?: string;
  /** Report names as given, `all` included. */
  reports?: string[];
  includeRestricted?: boolean;
}

/** The level each report needs: the one at which its data is read. */
const REPORT_FLOOR: Record<ExportReportName, Level> = {
  evidence: "L3",
  knowledge: "L1",
  impact: "L1",
  ownership: "L2",
};
const WHY: Record<ExportReportName, string> = {
  evidence: "where run records are read",
  knowledge: "",
  impact: "",
  ownership: "where the architecture check reads the tree",
};

/** The reports to write, in EXPORT_REPORTS order: those named, or with `all` every one the level reads. */
export function selectReports(names: readonly string[], level: Level): ExportReportName[] {
  const reaches = (name: ExportReportName) => LEVELS.indexOf(level) >= LEVELS.indexOf(REPORT_FLOOR[name]);
  if (names.includes("all")) return EXPORT_REPORTS.filter(reaches);
  return EXPORT_REPORTS.filter((name) => names.includes(name));
}

/** The export schema's generatedAt pattern. */
const ISO_8601 = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/;

/** Check the options that need no repository, so a typo costs nothing. Returns a message, or null. */
export function graphUsageProblem(options: GraphOptions, level: Level = "L1"): string | null {
  for (const name of options.reports ?? []) {
    if (name !== "all" && !(EXPORT_REPORTS as readonly string[]).includes(name)) {
      return `--report ${name}: the reports are ${EXPORT_REPORTS.join(", ")}, or all`;
    }
    const floor = REPORT_FLOOR[name as ExportReportName];
    if (floor !== undefined && LEVELS.indexOf(level) < LEVELS.indexOf(floor)) {
      return `--report ${name} needs --level ${floor} or above, ${WHY[name as ExportReportName]}`;
    }
  }
  if (options.format !== undefined && options.format !== "json") {
    return `--format ${options.format}: the only format is json`;
  }
  if (options.release !== undefined && parseRelease(options.release) === null) {
    return `--release ${options.release}: write it as <product ID>:<label>, such as PRD-LANTERN:pilot-1`;
  }
  if (options.generatedAt !== undefined && !ISO_8601.test(options.generatedAt)) {
    return `--generated-at ${options.generatedAt}: give an ISO 8601 time such as 2026-10-02T12:00:00Z`;
  }
  return null;
}

/** `<product>:<label>`, split at the first colon; the label is opaque and matched exactly (Core §7). */
export function parseRelease(text: string): { product: string; label: string } | null {
  const colon = text.indexOf(":");
  if (colon === -1) return null;
  const product = text.slice(0, colon);
  const label = text.slice(colon + 1);
  if (!ID_PATTERN.test(product) || label === "") return null;
  return { product, label };
}

export function graphCommand(session: Session, options: GraphOptions, io: Io): number {
  const { repo, result, snapshot } = session;
  const release = options.release === undefined ? null : parseRelease(options.release);
  if (release !== null && result.graph.artifacts.get(release.product)?.meta.type !== "product") {
    io.stderr(`intentset graph: --release names ${release.product}, which is not a product in this graph.\n`);
    return 2;
  }
  const reports: ExportReports = {};
  for (const name of selectReports(options.reports ?? [], session.level)) {
    if (name === "evidence" && session.evidence !== undefined) {
      reports.evidence = evidenceReport(session.evidence.check, session.evidence.records);
    } else if (name === "knowledge") {
      reports.knowledge = knowledgeReport(result.graph);
    } else if (name === "impact") {
      reports.impact = impactReport(result.graph);
    } else if (name === "ownership" && session.architecture !== undefined) {
      reports.ownership = ownershipReport(session.architecture, snapshot);
    }
  }
  const envelope = exportGraph(result, repo.registries, {
    repository: repo.config.repository,
    commit: snapshot.commit,
    ...(snapshot.commitUnavailable === undefined ? {} : { commitUnavailable: snapshot.commitUnavailable }),
    uncommitted: snapshot.uncommitted === true,
    scope: repo.config.scope,
    level: session.level,
    release,
    ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
    includeBodies: options.includeBodies,
    includeRestricted: options.includeRestricted === true,
    reports,
  });
  const text = `${JSON.stringify(envelope, null, 2)}\n`;

  if (options.out === undefined) {
    io.stdout(text);
  } else {
    const target = resolve(io.cwd, options.out);
    const problem = outputProblem(repo, target);
    if (problem !== null) {
      io.stderr(`intentset graph: --out ${options.out} ${problem}; tools never rewrite those.\n`);
      return 2;
    }
    try {
      writeFileSync(target, text);
    } catch (error) {
      io.stderr(`intentset graph: could not write ${options.out}: ${(error as Error).message}\n`);
      return 2;
    }
    const supplied = EXPORT_REPORTS.filter((name) => envelope.reports[name] !== undefined);
    const withheld = envelope.withholding.artifacts;
    io.stderr(
      `intentset graph: wrote ${options.out} (${envelope.artifacts.length} artifacts, ${envelope.validation.status}; ` +
        `reports: ${supplied.length === 0 ? "none" : supplied.join(", ")}; ` +
        `${withheld} restricted artifact${withheld === 1 ? "" : "s"} withheld)\n`,
    );
  }
  return result.ok ? 0 : 1;
}
