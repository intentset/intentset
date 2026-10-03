/**
 * What the Atlas is built from. The graph, registries and diagnostics come
 * from core's validation; evidence comes from @intentset/verification and
 * architecture from @intentset/architecture, both optional.
 *
 * The evidence shapes are declared here structurally, as the subset of
 * verification's `Classification` and `CoverageReport` the pages read, so the
 * Atlas reads those reports without depending on the package that makes them.
 * A test passes the real reports in, which holds the two in agreement.
 */
import type { Diagnostic, Graph, Level, Registries, Status } from "@intentset/core";

export interface AtlasSnapshot {
  /** The commit the graph was read at, or null when none could be read. */
  commit: string | null;
  /** The graph hash (ADR 0005); it must be the hash of `graph`. */
  graphHash: string;
  /** The declared scope globs; empty when the repository declares none. */
  scope: string[];
  /** The conformance level the diagnostics were produced at. */
  level: Level;
}

/** verification's EvidenceStatus. */
export type EvidenceStatus = "current-pass" | "current-fail" | "stale" | "skip" | "error" | "missing" | "unresolved";

export interface EvidenceRun {
  evidenceId: string;
  commit: string;
  graphHash: string;
  environment: string;
  scope: { product: string; release: string };
  tool: { name: string; version: string } | null;
  reviewer: string | null;
  finishedAt: string;
  result: "pass" | "fail" | "skip" | "error";
}

export interface VerificationEvidence {
  verificationId: string;
  method: "automated" | "manual";
  status: EvidenceStatus;
  note?: string;
  latest: EvidenceRun | null;
  history: readonly EvidenceRun[];
  atSnapshot: Record<"pass" | "fail" | "skip" | "error", number>;
  outOfScope: number;
}

/** The subset of verification's `Classification` the Atlas reads. */
export interface EvidenceClassification {
  snapshot: { commit: string | null; graphHash: string; scope: { product: string; release: string } | null };
  verifications: Record<string, VerificationEvidence>;
  ignoredOutOfScope: number;
  unknown: readonly unknown[];
  rejected: readonly unknown[];
  diagnostics: readonly Diagnostic[];
}

export interface ClaimCounts {
  behaviors: number;
  rules: number;
  scenarios: number;
}

export interface MethodCoverage {
  linked: boolean;
  verified: boolean;
}

export interface ClaimCoverage {
  id: string;
  type: "behavior" | "rule" | "scenario";
  path: string;
  lifecycle: Status;
  required: boolean;
  verifications: readonly { id: string; method: "automated" | "manual"; status: EvidenceStatus }[];
  linked: boolean;
  verified: boolean;
  manual: MethodCoverage;
  automated: MethodCoverage;
}

/** The subset of verification's `CoverageReport` the Atlas reads. */
export interface EvidenceCoverage {
  snapshot: EvidenceClassification["snapshot"];
  level: Level;
  measures: { linked: string; verified: string };
  denominator: ClaimCounts;
  excluded: { retired: ClaimCounts };
  linked: ClaimCounts;
  verified: ClaimCounts;
  manual: { linked: ClaimCounts; verified: ClaimCounts };
  automated: { linked: ClaimCounts; verified: ClaimCounts };
  perClaim: readonly ClaimCoverage[];
  unresolved: readonly { subject: string; reason: string }[];
}

export interface AtlasEvidence {
  classification: EvidenceClassification;
  coverage: EvidenceCoverage;
}

export interface AtlasArchitecture {
  diagnostics: Diagnostic[];
  /** architecture's ArchitectureSummary, shown as it is: keys sorted, values as written. */
  summary: Record<string, unknown>;
}

export interface AtlasInput {
  graph: Graph;
  registries: Registries;
  /** Validation diagnostics, syntax included; architecture and evidence diagnostics are added from their reports. */
  diagnostics: Diagnostic[];
  snapshot: AtlasSnapshot;
  /** Run evidence classified at this snapshot. Absent or null: the Atlas says no run evidence was supplied. */
  evidence?: AtlasEvidence | null;
  /** An architecture check's result. Absent or null: ownership is shown as declared, and says so. */
  architecture?: AtlasArchitecture | null;
}

export interface AtlasOptions {
  /** The name in every page's navigation and title. Default "Intentset Atlas". */
  title?: string;
}
