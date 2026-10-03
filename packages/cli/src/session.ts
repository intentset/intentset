/**
 * The shared front half of every reading command: find the root, load the
 * repository, and run every check the requested level asks for, each level
 * including the ones below it (Core §11):
 *
 *   L1  core: parse, identity, fields, typed links, hierarchy, lifecycle, narrative
 *   L2  + ownership (core) and the architecture check over the repository tree
 *   L3  + run records classified against this snapshot, and current-pass coverage
 *   L4  + publication readiness: active knowledge is review-current and carries availability
 *   L5  is a claim about continuous CI, which one run cannot check; main refuses it
 *
 * Returns an exit code instead when the command cannot proceed, having said
 * why. Nothing here writes.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type ArchitectureResult,
  type BaselineEntry,
  checkArchitecture,
  type Mode,
  parseBaseline,
} from "@intentset/architecture";
import {
  type Artifact,
  compareStrings,
  type Diagnostic,
  type Graph,
  graphHash,
  hasErrors,
  LEVELS,
  type Level,
  sortDiagnostics,
  type ValidationResult,
  validate,
} from "@intentset/core";
import { reviewStatus } from "@intentset/publisher";
import {
  checkEvidence,
  type EvidenceCheck,
  type EvidenceSnapshot,
  type RunRecord,
  type RunScope,
  readRunRecords,
} from "@intentset/verification";
import { insideRoot } from "./outputs.ts";
import { formatDiagnostic, type Io, type Snapshot } from "./output.ts";
import { type CarrierName, CONFIG_PATH, findRoot, loadRepository, type Repository } from "./repository.ts";
import { readTree, type Tree } from "./tree.ts";

/** Where run records are read from when no --evidence is given. Local output: not to be committed. */
export const EVIDENCE_DIR = ".intentset/evidence";

export interface SessionOptions {
  root?: string;
  carrier: CarrierName;
  level: Level;
  /** L2 and above: architecture mode and baseline. */
  mode?: Mode;
  baseline?: string;
  /** L3 and above: evidence files as given (relative to cwd); undefined reads EVIDENCE_DIR. */
  evidence?: string[];
  /** L3 and above: the exact product and release evidence is assessed for; null considers every scope. */
  scope?: RunScope | null;
  /** The day exceptions expire against; default today, UTC. */
  today?: string;
}

export interface EvidenceRun {
  /** The files read, as repository-relative paths where they lie inside the root. */
  files: string[];
  records: number;
  check: EvidenceCheck;
  snapshot: EvidenceSnapshot;
}

export interface Session {
  repo: Repository;
  level: Level;
  /** Core's result with every level's diagnostics folded in, so `ok` and the export carry them all. */
  result: ValidationResult;
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  snapshot: Snapshot;
  tree?: Tree;
  architecture?: ArchitectureResult;
  evidence?: EvidenceRun;
  /** L4: the active knowledge artifacts checked for publication readiness, by ID. */
  publication?: { checked: string[] };
}

const at = (level: Level, floor: Level) => LEVELS.indexOf(level) >= LEVELS.indexOf(floor);

/** Load and check at the level, or return the exit code (2) after reporting why the repository could not be read. */
export function openSession(command: string, options: SessionOptions, io: Io): Session | number {
  const root = findRoot(io.cwd, options.root);
  if (root === null) {
    const where = options.root === undefined ? "this directory or any above it" : options.root;
    io.stderr(
      `intentset ${command}: no ${CONFIG_PATH} in ${where}.\n` +
        "Run `intentset init` at the repository root to create one, or pass --root <dir>.\n",
    );
    return 2;
  }
  const repo = loadRepository(root, options.carrier);
  if (!repo.configOk) {
    io.stderr(`intentset ${command}: the configuration has errors, so the scope is unknown.\n`);
    for (const d of sortDiagnostics(repo.diagnostics)) io.stderr(formatDiagnostic(d));
    return 2;
  }
  const level = options.level;
  const validated = validate(repo.inputs, repo.registries, { level });
  const graph = validated.graph;
  const snapshot: Snapshot = { commit: repo.commit, graphHash: graphHash(graph) };
  if (repo.commitUnavailable !== undefined) snapshot.commitUnavailable = repo.commitUnavailable;
  if (repo.uncommitted === true) snapshot.uncommitted = true;
  const all: Diagnostic[] = [...validated.diagnostics, ...repo.diagnostics];
  const session: Omit<Session, "result" | "diagnostics" | "errors" | "warnings"> = { repo, level, snapshot };

  if (at(level, "L2")) {
    let baseline: BaselineEntry[] = [];
    if (options.baseline !== undefined) {
      const read = readBaseline(resolve(io.cwd, options.baseline));
      if (typeof read === "string") {
        io.stderr(`intentset ${command}: --baseline ${options.baseline}: ${read}\n`);
        return 2;
      }
      baseline = read;
    }
    const tree = readTree(root, repo.config);
    const architecture = checkArchitecture(
      graph,
      repo.registries,
      { files: tree.files },
      {
        level,
        mode: options.mode ?? "migration",
        baseline,
        today: options.today ?? new Date().toISOString().slice(0, 10),
        ...(repo.config.registries === null ? {} : { registriesPath: repo.config.registries }),
      },
    );
    session.tree = tree;
    session.architecture = architecture;
    all.push(...architecture.diagnostics);
  }

  if (at(level, "L3")) {
    const files = evidenceFiles(root, io.cwd, options.evidence);
    const records: RunRecord[] = [];
    const seen = new Set<string>();
    const shown: string[] = [];
    for (const file of files) {
      const path = insideRoot(root, file) ?? file;
      let json: unknown;
      try {
        json = JSON.parse(readFileSync(file, "utf8"));
      } catch (error) {
        io.stderr(`intentset ${command}: evidence ${path} is not readable JSON: ${(error as Error).message}\n`);
        return 2;
      }
      const read = readRunRecords(json, path);
      all.push(...read.diagnostics);
      // The same record imported into two files is one run, not two.
      for (const record of read.records) {
        const key = JSON.stringify(record);
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(record);
      }
      shown.push(path);
    }
    const evidenceSnapshot: EvidenceSnapshot = {
      commit: snapshot.commit,
      graphHash: snapshot.graphHash,
      scope: options.scope ?? null,
    };
    const check = checkEvidence(graph, records, evidenceSnapshot, {
      level,
      files: session.tree?.paths,
      evidencePath: shown.length === 1 ? shown[0] : null,
    });
    session.evidence = { files: shown, records: records.length, check, snapshot: evidenceSnapshot };
    all.push(...check.diagnostics);
  }

  if (at(level, "L4")) {
    const readiness = publicationReadiness(graph);
    session.publication = { checked: readiness.checked };
    all.push(...readiness.diagnostics);
  }

  const diagnostics = sortDiagnostics(all);
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const result: ValidationResult = { graph, diagnostics, ok: !hasErrors(diagnostics) };
  return { ...session, result, diagnostics, errors, warnings: diagnostics.length - errors };
}

/** A baseline file's entries, or why it could not be read. */
function readBaseline(file: string): BaselineEntry[] | string {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return `could not be read: ${(error as Error).message}`;
  }
  try {
    return parseBaseline(text);
  } catch (error) {
    return (error as Error).message;
  }
}

/** The evidence files to read: those given, else every `*.json` in EVIDENCE_DIR, sorted. Absolute paths. */
export function evidenceFiles(root: string, cwd: string, given: string[] | undefined): string[] {
  if (given !== undefined && given.length > 0) return given.map((file) => resolve(cwd, file));
  const dir = join(root, EVIDENCE_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort(compareStrings)
    .map((name) => join(dir, name));
}

/**
 * Core §9 and §11 at L4: every knowledge artifact that is neither draft nor
 * retired is current against the sources it was reviewed against, and says
 * where it applies. Anything else is CORE008, because it could not be
 * published as current.
 */
export function publicationReadiness(graph: Graph): { checked: string[]; diagnostics: Diagnostic[] } {
  const checked: string[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const id of [...graph.artifacts.keys()].sort(compareStrings)) {
    const artifact = graph.artifacts.get(id) as Artifact;
    const { meta } = artifact;
    if (meta.type !== "knowledge" || meta.status === "draft" || meta.status === "retired") continue;
    checked.push(id);
    const report = (field: string, message: string, remediation: string) =>
      diagnostics.push({
        code: "CORE008",
        severity: "error",
        origin: "publication",
        artifact: id,
        path: artifact.path,
        field,
        message,
        remediation,
      });
    if (meta.availability === undefined) {
      report(
        "/intentset/availability",
        `${meta.status} knowledge ${id} has no availability, so no release could publish it (Core §7: missing access information fails closed).`,
        "Add availability with the products, releases, roles, editions and flags the guidance applies to.",
      );
    }
    const review = reviewStatus(graph, artifact);
    if (review.status === "current") continue;
    const reasons: string[] = [];
    if (review.changed.length > 0) reasons.push(`${review.changed.join(", ")} changed since review`);
    if (review.missing.length > 0) reasons.push(`no review pin for ${review.missing.join(", ")}`);
    if (review.reviewer === null) reasons.push("it names no reviewer");
    if (review.reviewedAt === null) reasons.push("it gives no review date");
    report(
      review.reviewer === null
        ? "/intentset/reviewedBy"
        : review.reviewedAt === null
          ? "/intentset/reviewedAt"
          : "/intentset/extensions/intentset.org~1review",
      `${meta.status} knowledge ${id} needs review: ${reasons.join("; ")} (Core §9).`,
      "Review the knowledge against its current sources, then update reviewedBy, reviewedAt and the intentset.org/review pins (Core §9).",
    );
  }
  return { checked, diagnostics };
}
