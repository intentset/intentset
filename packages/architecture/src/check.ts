/**
 * `checkArchitecture`: the Traceable VSA check over one snapshot (VSA §2,
 * profile §2–§4). It is pure: the graph and registries come from core, the
 * repository arrives as a map of path to text, and nothing is read from disk,
 * executed or fetched (invariant 7), so the conformance harness can run it
 * over an in-memory tree.
 *
 * Order: configuration (`.intentset/architecture.yaml` in the tree, then the
 * caller's), claims and ownership, the import graph and its boundaries,
 * dependencies and cycles, then exceptions (VSA §9), then the baseline in
 * migration mode. What could not be checked is listed in `unresolved` and,
 * for imports, reported as a TS004 warning: never a pass (invariant 6).
 */
import {
  type Diagnostic,
  type Graph,
  type Level,
  type OwnershipEntry,
  type OwnershipReportSection,
  type Registries,
  sortDiagnostics,
} from "@intentset/core";
import { AREA_REVIEW_REQUIRED, checkAreas } from "./areas.ts";
import { applyBaseline, type BaselineEntry, type Mode } from "./baseline.ts";
import { checkBoundaries, checkUnclassified } from "./boundaries.ts";
import { checkClaims } from "./claims.ts";
import { ARCHITECTURE_CONFIG_PATH, type ArchitectureConfig, readArchitectureConfig, resolveConfig } from "./config.ts";
import { checkDependencies } from "./dependencies.ts";
import { applyExceptions, type ExceptionRecord, readExceptionRecord, readExceptions } from "./exceptions.ts";
import { type Finding, finding } from "./finding.ts";
import { buildImportGraph, type ImportEdge } from "./imports.ts";
import { checkOwnership } from "./ownership.ts";
import { isCode } from "./paths.ts";
import { compareStrings } from "./patterns.ts";
import { buildModel } from "./regions.ts";
import { Resolver } from "./resolve.ts";

export interface CheckOptions {
  /** Laid over the defaults and over `.intentset/architecture.yaml`. */
  config?: Partial<ArchitectureConfig>;
  /** Conformance level; VSA001 runs at L2 and above. Default L2. */
  level?: Level;
  /** Exception records handed in, in addition to architecture/exceptions/*.yaml in the tree. */
  exceptions?: readonly (ExceptionRecord | Record<string, unknown>)[];
  baseline?: readonly BaselineEntry[];
  /** "migration" applies the baseline; "strict" ignores it. Default migration. */
  mode?: Mode;
  /** The date exceptions expire against, YYYY-MM-DD. Default today, UTC. */
  today?: string;
  /** Where registries.yaml lives, for diagnostics about resources. Default "registries.yaml". */
  registriesPath?: string;
}

export interface ArchitectureSummary {
  mode: Mode;
  level: Level;
  /** Active (non-retired) slices. */
  slices: number;
  /** Files, tests excluded, that some slice claims. */
  filesClaimed: number;
  /** In-scope code files under source and backend roots that no slice, region or resource owns. */
  filesUnclaimed: number;
  /** Code files outside the declared scope: counted, never reported one by one (Core §11). */
  outOfScope: number;
  /** Resolved file-to-file import edges from in-scope production files. */
  edges: number;
  /** Those that cross from one slice into another. */
  crossSliceEdges: number;
  /** Dependency cycles found (VSA005), excepted or not. */
  cycles: number;
  /** Diagnostics a current exception turned into warnings. */
  excepted: number;
  /** Diagnostics the baseline turned into warnings (migration mode only). */
  baselined: number;
  /** Baseline entries that matched nothing and can be retired. */
  baselineStale: number;
  /** What could not be checked: never a pass (invariant 6). */
  unresolved: string[];
  /** Rules this check cannot decide from source and leaves to review (VSA §2). */
  reviewRequired: string[];
}

export interface ArchitectureResult {
  diagnostics: Diagnostic[];
  summary: ArchitectureSummary;
  /** The resolved import graph, for reports and impact views. */
  edges: ImportEdge[];
  /**
   * Where every file falls, sorted by path: each production file's region and
   * owner, every test file with the slice its claims match, and nothing for a
   * file in the external region (root configuration, scripts, documents that
   * nothing claims). Out-of-scope files are attributed too: scope decides what
   * is reported, not who owns what.
   */
  ownership: OwnershipEntry[];
}

/** VSA §2: the rules that are review assertions, snapshot diffs or contract diffs rather than structure. */
export const REVIEW_REQUIRED = [
  "VSA007 business behavior is not owned by shared, infrastructure or composition: an architecture review assertion",
  "VSA008 verification definitions cover negative and authorization cases: core links plus review",
  "VSA010 backend access passes through the seam: imports are checked, dynamic network access is not",
  "VSA011 public contract changes carry a compatibility assessment: needs a contract diff and review record",
  "VSA012 deleting or splitting a slice dispositions what it owned: needs a diff between two snapshots",
  "TS005 runtime resolver and type-checker agree on aliases: bundler configuration is not read",
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkArchitecture(
  graph: Graph,
  registries: Registries,
  tree: { files: ReadonlyMap<string, string> },
  options: CheckOptions = {},
): ArchitectureResult {
  const level = options.level ?? "L2";
  const mode = options.mode ?? "migration";
  const registriesPath = options.registriesPath ?? "registries.yaml";
  const configDiagnostics: Diagnostic[] = [];
  let fileConfig: Partial<ArchitectureConfig> | undefined;
  const configText = tree.files.get(ARCHITECTURE_CONFIG_PATH);
  if (configText !== undefined) {
    const read = readArchitectureConfig(configText, ARCHITECTURE_CONFIG_PATH);
    fileConfig = read.config;
    configDiagnostics.push(...read.diagnostics);
  }
  const config = resolveConfig(fileConfig, options.config);
  const model = buildModel(graph, registries, tree.files, config);
  const unresolved: string[] = [];

  for (const slice of model.slices) {
    for (const i of slice.invalidClaims) {
      unresolved.push(
        `${slice.path}: claim ${i} of ${slice.id} (${slice.meta.claims[i].path}) is not a valid pattern and was not resolved`,
      );
    }
  }

  const codeFiles = new Map([...model.files].filter(([path]) => isCode(path)));
  const resolver = new Resolver(model.files, config);
  const imports = buildImportGraph(codeFiles, resolver);
  const findings: Finding[] = [];
  for (const item of imports.unresolved) {
    if (!model.inScope(item.path)) continue;
    const where = item.line === null ? item.path : `${item.path}:${item.line}`;
    unresolved.push(`${where}: ${item.message}`);
    findings.push(
      finding({
        code: "TS004",
        severity: "warning",
        artifact: model.regionOf(item.path).kind === "slice" ? (model.regionOf(item.path).owner ?? null) : null,
        path: item.path,
        ...(item.line !== null ? { location: { line: item.line } } : {}),
        message: `${item.message.charAt(0).toUpperCase()}${item.message.slice(1)}; the reference was left out of boundary analysis.`,
        remediation:
          "Use a literal specifier that resolves to a file in the repository or to a package, so the boundary can be checked (TS004).",
      }),
    );
  }
  for (const note of [...resolver.tsconfigs.notes, ...resolver.notes]) unresolved.push(`${note.path}: ${note.message}`);

  findings.push(...checkClaims(model, graph, registriesPath));
  findings.push(...checkOwnership(model, graph, level));
  const boundaries = checkBoundaries(model, imports.edges, resolver);
  findings.push(...boundaries.findings);
  findings.push(...checkUnclassified(model));
  const areaCheck = checkAreas(model, imports.edges);
  findings.push(...areaCheck.findings);
  unresolved.push(...areaCheck.unresolved);
  const dependencies = checkDependencies(model, graph, boundaries.sliceEdges);
  findings.push(...dependencies.findings);

  // Exceptions: the tree's records and any handed in.
  const fromTree = readExceptions(model.files);
  const records = [...fromTree.records];
  const recordProblems = [...fromTree.findings];
  for (const raw of options.exceptions ?? []) {
    const { source, ...fields } = raw as Record<string, unknown>;
    const read = readExceptionRecord(fields, typeof source === "string" ? source : null);
    recordProblems.push(...read.findings);
    if (read.record !== null) records.push(read.record);
  }
  const excepted = applyExceptions(findings, records, options.today ?? today());

  let diagnostics: Diagnostic[] = [
    ...configDiagnostics,
    ...excepted.findings.map((item) => item.diagnostic),
    ...recordProblems.map((item) => item.diagnostic),
    ...excepted.recordFindings.map((item) => item.diagnostic),
  ];
  const baseline = applyBaseline(diagnostics, options.baseline ?? [], mode);
  diagnostics = sortDiagnostics(baseline.diagnostics);

  const owned = (path: string) => {
    const kind = model.regionOf(path).kind;
    return kind !== "backend" && kind !== "unowned";
  };
  const summary: ArchitectureSummary = {
    mode,
    level,
    slices: model.slices.length,
    filesClaimed: model.production.filter((path) => (model.claimOwners.get(path) ?? []).length > 0).length,
    filesUnclaimed: model.production.filter((path) => isCode(path) && model.inScope(path) && !owned(path)).length,
    outOfScope: [...model.files.keys()].filter((path) => isCode(path) && !model.inScope(path)).length,
    edges: boundaries.fileEdges,
    crossSliceEdges: boundaries.crossSliceEdges,
    cycles: dependencies.cycles,
    excepted: excepted.excepted,
    baselined: baseline.baselined,
    baselineStale: baseline.stale.length,
    unresolved: [...new Set(unresolved)].sort(compareStrings),
    reviewRequired: [...REVIEW_REQUIRED, ...(config.areas.length > 0 ? AREA_REVIEW_REQUIRED : [])],
  };
  const ownership: OwnershipEntry[] = [];
  for (const path of model.files.keys()) {
    if (model.isTest(path)) {
      ownership.push({ path, region: "test", owner: model.testOwner(path) });
      continue;
    }
    const region = model.regionOf(path);
    if (region.kind === "external") continue;
    ownership.push({ path, region: region.kind, owner: region.owner ?? null });
  }
  ownership.sort((a, b) => compareStrings(a.path, b.path));
  return { diagnostics, summary, edges: imports.edges, ownership };
}

/**
 * `reports.ownership` for the export (spec/export.md §4.4): the check's file
 * attribution, stamped with the snapshot it was read at, so a consumer can
 * turn a file from a stack frame into a slice, its behaviors and its owner.
 */
export function ownershipReport(
  result: ArchitectureResult,
  snapshot: { commit: string | null; graphHash: string },
): OwnershipReportSection {
  return {
    commit: snapshot.commit,
    graphHash: snapshot.graphHash,
    files: result.ownership.map((entry) => ({ ...entry })),
    withheld: 0,
  };
}
