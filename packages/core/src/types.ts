/**
 * The vocabulary of Core v0.1 (spec/core-0.1.md §2, §4, §5, §7) and the shapes
 * the packages exchange. This file is the contract; it carries no logic.
 */
import type { Diagnostic } from "./diagnostics.ts";

export const SPEC_VERSION = "0.1";

export const ARTIFACT_TYPES = [
  "product",
  "intent",
  "outcome",
  "measure",
  "capability",
  "behavior",
  "rule",
  "scenario",
  "slice",
  "contract",
  "verification",
  "knowledge",
  "decision",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const STATUSES = ["draft", "approved", "implemented", "released", "deprecated", "retired"] as const;
export type Status = (typeof STATUSES)[number];

export const VISIBILITIES = ["public", "customer", "internal", "restricted"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Core §4. */
export const ID_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;

/** The authored relationship fields of Core §5, in the direction they are written. */
export const LINK_KINDS = [
  "parent",
  "governedBy",
  "illustrates",
  "implements",
  "dependsOn",
  "exposes",
  "consumes",
  "verifies",
  "explains",
  "informedBy",
  "requires",
  "supports",
  "replacedBy",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/**
 * Allowed endpoints per relationship, Core §5. `parent` is listed per source
 * type because its target depends on the source. `replacedBy` requires the
 * same type on both ends, which the table cannot say; the validator checks it.
 */
export const LINK_ENDPOINTS: Record<
  Exclude<LinkKind, "parent" | "replacedBy">,
  { from: readonly ArtifactType[]; to: readonly ArtifactType[] }
> = {
  governedBy: { from: ["behavior"], to: ["rule"] },
  illustrates: { from: ["scenario"], to: ["behavior"] },
  implements: { from: ["slice"], to: ["behavior"] },
  dependsOn: { from: ["slice"], to: ["slice"] },
  exposes: { from: ["slice"], to: ["contract"] },
  consumes: { from: ["slice"], to: ["contract"] },
  verifies: { from: ["verification"], to: ["behavior", "rule", "scenario"] },
  explains: { from: ["knowledge"], to: ["behavior", "rule", "capability"] },
  informedBy: { from: ["slice", "contract", "behavior"], to: ["decision"] },
  requires: { from: ["behavior"], to: ["behavior"] },
  supports: { from: ["outcome", "capability"], to: ["intent", "outcome"] },
};

/** `parent` targets per source type, Core §5. A product has no parent. */
export const PARENT_TARGETS: Partial<Record<ArtifactType, readonly ArtifactType[]>> = {
  intent: ["product"],
  outcome: ["intent"],
  measure: ["outcome"],
  capability: ["outcome", "capability"],
  behavior: ["capability"],
};

/** Required level-two headings per type, Core §6. */
export const REQUIRED_SECTIONS: Record<ArtifactType, readonly string[]> = {
  product: ["Scope"],
  intent: ["Rationale"],
  outcome: ["Measure"],
  measure: ["Method"],
  capability: ["Overview"],
  behavior: ["Behavior", "Preconditions", "Outcomes"],
  rule: ["Constraint"],
  scenario: ["Given", "When", "Then"],
  slice: ["Responsibility", "Public contract", "Verification"],
  contract: ["Interface", "Compatibility"],
  verification: ["Procedure", "Expected result"],
  knowledge: ["Guidance"],
  decision: ["Context", "Decision", "Consequences"],
};

/** Core §9: a tip is one line of plain text, no leading or trailing whitespace, at most this many characters. */
export const TIP_MAX_LENGTH = 160;
export const TIP_PATTERN = /^\S(?:[^\r\n]*\S)?$/u;

export interface Availability {
  products: string[];
  releases: string[];
  roles: string[];
  editions: string[];
  flags: string[];
}

export const CLAIM_KINDS = ["source", "backend", "contract", "verification", "documentation"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export interface Claim {
  kind: ClaimKind;
  /** Repository-relative POSIX pattern: literal segments, `*` within a segment, `**` across segments (VSA §3). */
  path: string;
}

/** VSA §3 slice metadata. */
export interface SliceMeta {
  kind: "product" | "technical";
  rationale?: string;
  domain: string;
  /** Repository-relative file paths, the slice's public contract surfaces: one per package it spans (VSA §3). */
  entrypoints: string[];
  layers: Record<string, string[]>;
  claims: Claim[];
  usesResources: string[];
}

/** Core §8 verification metadata. */
export interface VerificationMeta {
  method: "automated" | "manual";
  locator: string;
  selector: string;
}

export const MEASURE_DIRECTIONS = ["increase", "decrease"] as const;
export type MeasureDirection = (typeof MEASURE_DIRECTIONS)[number];

/** Core §6: a metric identifier, lower case, words joined by `_` or `-`. */
export const METRIC_PATTERN = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;

/** The literal a measure's baseline carries when none has been taken yet (Core §6). */
export const BASELINE_UNKNOWN = "unknown";

/** Core §6 measure metadata: how the parent outcome is judged. */
export interface MeasureMeta {
  metric: string;
  /** A value, or `unknown` (BASELINE_UNKNOWN). */
  baseline: string;
  target: string;
  /** When the measure is read, relative to a release or a date; prose, not parsed. */
  window: string;
  /** An entry in the repository's `evidenceSources` registry. */
  source: string;
  direction?: MeasureDirection;
}

/** The `intentset` block of a document's frontmatter after validation, Core §4. */
export interface ArtifactMeta {
  spec: typeof SPEC_VERSION;
  profile: string;
  id: string;
  type: ArtifactType;
  title: string;
  status: Status;
  owner: string;
  visibility: Visibility;
  audiences: string[];
  parent?: string;
  links: Partial<Record<Exclude<LinkKind, "parent">, string[]>>;
  availability?: Availability;
  revision?: number;
  reviewedAt?: string;
  reviewedBy?: string;
  /** Namespaced extensions, preserved and never interpreted. */
  extensions?: Record<string, unknown>;
  /** Knowledge only (Core §9): one sentence per explained ID, keys sorted. */
  tips?: Record<string, string>;
  slice?: SliceMeta;
  verification?: VerificationMeta;
  measure?: MeasureMeta;
}

export interface Heading {
  depth: number;
  /** Plain text of the heading, inline markup removed. */
  text: string;
  /** 1-based line in the file. */
  line: number;
}

/**
 * What a carrier parser hands to core (ADR 0003). `@intentset/markset-adapter`
 * produces it with the Markset parser; `plainCarrier` in core produces it from
 * nothing but the text, for the plain-Markdown fallback.
 */
export interface DocumentInput {
  /** Repository-relative POSIX path. */
  path: string;
  /** The file's full UTF-8 text. */
  source: string;
  /** The raw YAML between the `---` fences, and the 1-based line the YAML starts on; null when absent. */
  frontmatter: { text: string; line: number } | null;
  /** Headings in document order, from outside code fences only. */
  headings: Heading[];
  /** Carrier diagnostics with origin "syntax", passed through unchanged. */
  syntax: Diagnostic[];
}

/** One artifact: its validated metadata plus where it came from. */
export interface Artifact {
  meta: ArtifactMeta;
  path: string;
  /** SHA-256 of the file bytes, lowercase hex. */
  sourceHash: string;
  /** The document body: everything after the frontmatter. */
  body: string;
  headings: Heading[];
  /** Unknown top-level frontmatter keys, preserved as read (Core §3). */
  foreign: Record<string, unknown>;
}

export interface Edge {
  kind: LinkKind;
  from: string;
  to: string;
  /** True for the inverse of an authored edge; derived edges are never authored (Core §5, §12). */
  derived: boolean;
}

export interface Graph {
  artifacts: Map<string, Artifact>;
  /** Authored edges, in document order then field order. */
  edges: Edge[];
  /** Inverse edges, one per authored edge, marked derived. */
  derived: Edge[];
  /** Outgoing authored edges by source ID. */
  out: Map<string, Edge[]>;
  /** Incoming authored edges by target ID. */
  in: Map<string, Edge[]>;
}

export interface Resource {
  id: string;
  path: string;
  owner: string;
  consumers: string[];
}

/** The repository registries that define owners, audiences, release dimensions and shared resources. */
export interface Registries {
  owners: string[];
  audiences: string[];
  releases: string[];
  roles: string[];
  editions: string[];
  flags: string[];
  /** Where a measure's evidence is expected to come from (Core §6): an analytics product, a study, a survey. */
  evidenceSources: string[];
  resources: Resource[];
}

export const EMPTY_REGISTRIES: Registries = {
  owners: [],
  audiences: [],
  releases: [],
  roles: [],
  editions: [],
  flags: [],
  evidenceSources: [],
  resources: [],
};

/** `.intentset/config.yaml`: the declared repository scope a conformance claim is about (Core §11). */
export interface Config {
  /** Stable identity of the repository, carried by the export (e.g. "intentset/intentset"). */
  repository: string;
  /** Globs selecting the documents in scope; the default is every `.md` file under the repository. */
  scope: string[];
  /** Path of registries.yaml, or null when the repository declares none. */
  registries: string | null;
  /** Globs excluded from scope and from source enumeration. */
  ignore: string[];
}

/** Conformance levels, Core §11. Checks above the requested level do not run. */
export const LEVELS = ["L1", "L2", "L3", "L4", "L5"] as const;
export type Level = (typeof LEVELS)[number];

export interface ValidationOptions {
  level?: Level;
}

export interface ValidationResult {
  graph: Graph;
  /** Sorted by compareDiagnostics. Includes the carrier's syntax diagnostics. */
  diagnostics: Diagnostic[];
  /** False when any diagnostic is an error. */
  ok: boolean;
}

/** One hop in an impact traversal, Core §10. */
export interface ImpactStep {
  id: string;
  /** The edge that led here, as seen from the start: "verifies←" means a verification that verifies the previous node. */
  via: string;
  reason: string;
}

export interface ImpactHit {
  id: string;
  type: ArtifactType;
  title: string;
  path: ImpactStep[];
}

export interface ImpactReport {
  start: string;
  /** Artifacts one authored or derived edge away. */
  direct: ImpactHit[];
  /** Everything reachable beyond that, each with the path that reached it. */
  candidates: ImpactHit[];
  /** Outgoing rules, contracts and decisions, for review context. */
  context: ImpactHit[];
  /** Navigation ancestors through `parent`. */
  ancestors: string[];
}

/**
 * The versioned export envelope (spec/export.md; spec/export.schema.json). 0.2 was
 * the first version a consumer could pin: 0.1 carried untyped report slots and
 * restricted artifacts by default (ADR 0008). 0.3 added the measure type, the
 * `evidenceSources` registry, and `measure` and `tips` on every artifact (ADR 0012).
 */
export const EXPORT_CONTRACT = "intentset/export/0.3";

/** The contracts this implementation reads. A consumer rejects every other value (spec/export.md §5). */
export const SUPPORTED_EXPORT_CONTRACTS: readonly string[] = [EXPORT_CONTRACT];

/** The optional report sections, in the order they are written. An absent section means not supplied. */
export const EXPORT_REPORTS = ["evidence", "knowledge", "impact", "ownership"] as const;
export type ExportReportName = (typeof EXPORT_REPORTS)[number];

export interface ExportArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  status: Status;
  owner: string;
  visibility: Visibility;
  audiences: string[];
  profile: string;
  revision: number | null;
  path: string;
  sourceHash: string;
  /** Null when there is none, or when the parent is withheld (and counted in `withheldLinks`). */
  parent: string | null;
  links: Partial<Record<Exclude<LinkKind, "parent">, string[]>>;
  /** Inverse edges, keyed by the authored kind, marked derived by living here. */
  derived: Partial<Record<LinkKind, string[]>>;
  /** Link targets and sources left out because the artifact at the other end is withheld: authored, derived and parent. */
  withheldLinks: number;
  availability: Availability | null;
  slice: SliceMeta | null;
  verification: VerificationMeta | null;
  /** Null unless the artifact is a measure; `direction` is null when the author set none. */
  measure: (Omit<MeasureMeta, "direction"> & { direction: MeasureDirection | null }) | null;
  /** Null unless the artifact is knowledge with tips (Core §9). */
  tips: Record<string, string> | null;
  extensions: Record<string, unknown> | null;
  /** Present only when the export was asked to include bodies. */
  body?: string;
}

/** A run record as the evidence report carries it: spec/evidence.schema.json's record, unchanged. */
export interface ExportRunRecord {
  evidenceId: string;
  verificationId: string;
  commit: string;
  graphHash: string;
  environment: string;
  scope: { product: string; release: string };
  tool: { name: string; version: string } | null;
  reviewer: string | null;
  startedAt: string;
  finishedAt: string;
  result: "pass" | "fail" | "skip" | "error";
  uri: string;
  rationale?: string;
  extensions?: Record<string, unknown>;
}

/** Core §8 freshness, as the evidence check classifies it. Only current-pass is a pass. */
export const EXPORT_EVIDENCE_STATUSES = [
  "current-pass",
  "current-fail",
  "stale",
  "skip",
  "error",
  "missing",
  "unresolved",
] as const;
export type ExportEvidenceStatus = (typeof EXPORT_EVIDENCE_STATUSES)[number];

/** `reports.evidence`: every verification classified at the envelope's snapshot, and every claim's coverage. */
export interface EvidenceReportSection {
  /** The snapshot the records were classified against: the envelope's own. */
  commit: string | null;
  graphHash: string;
  /** The exact product and release assessed, or null when records of every scope were considered. */
  scope: { product: string; release: string } | null;
  /** Run records read, before classification. */
  records: number;
  /** One per verification artifact, sorted by ID. */
  verifications: ExportVerificationEvidence[];
  /** One per behavior, rule and scenario that is not retired, sorted by ID. */
  claims: ExportClaimCoverage[];
}

export interface ExportVerificationEvidence {
  id: string;
  method: "automated" | "manual";
  status: ExportEvidenceStatus;
  /** Why the status is qualified, or what was set aside; null when nothing was. */
  note: string | null;
  /** The record that decided the status: the latest at the snapshot, else the latest in scope; null when none. */
  latest: ExportRunRecord | null;
  /** Results of the records at the snapshot, so a failure followed by a pass is still countable. */
  atSnapshot: { pass: number; fail: number; skip: number; error: number };
  /** In-scope records for this verification, at any snapshot. */
  runs: number;
  /** Records for this verification that named another product or release and were not considered. */
  outOfScope: number;
}

export interface ExportClaimCoverage {
  id: string;
  type: "behavior" | "rule" | "scenario";
  /** The claim's lifecycle status: an editorial claim, never a test result. */
  lifecycle: Status;
  /** True when the level asks for evidence (L3 and above) and the claim is not a draft. */
  required: boolean;
  /** At least one applicable verification names the claim. */
  linked: boolean;
  /** At least one applicable verification, and every one of them a current pass. */
  verified: boolean;
  /** Applicable verifications naming the claim, sorted. */
  verifications: string[];
  /** Verifications left out of that list because they are withheld. */
  withheld: number;
}

/** `reports.knowledge`: the review status of every knowledge artifact (Core §9). */
export interface KnowledgeReportSection {
  graphHash: string;
  /** One per knowledge artifact, sorted by ID. */
  artifacts: ExportKnowledgeReview[];
}

export interface ExportKnowledgeReview {
  id: string;
  lifecycle: Status;
  /** current only while every source still has the hash it was reviewed against and a reviewer and time are named. */
  status: "current" | "needs-review";
  reviewer: string | null;
  reviewedAt: string | null;
  /** What a review must pin: the explained artifacts and the rules governing each explained behavior. Sorted. */
  sources: string[];
  /** Sources whose hash differs from the pin, or that are gone. Sorted. */
  changed: string[];
  /** Sources the review record does not pin. Sorted. */
  missing: string[];
  /** Entries left out of sources, changed and missing because they are withheld. */
  withheld: number;
}

/** One hit in the impact report: the artifact and the path that reached it. Join to `artifacts` by ID. */
export interface ExportImpactHit {
  id: string;
  path: ImpactStep[];
}

export interface ExportImpactEntry {
  start: string;
  direct: ExportImpactHit[];
  candidates: ExportImpactHit[];
  context: ExportImpactHit[];
  ancestors: string[];
  /** Hits and ancestors left out because they, or a step on their path, are withheld. */
  withheld: number;
}

/** `reports.impact`: Core §10 impact from every exported artifact. A start absent here was not computed. */
export interface ImpactReportSection {
  graphHash: string;
  /** Reachability marks an artifact for review; it is not proof that runtime behavior changed. */
  note: string;
  /** One per exported artifact, sorted by start. */
  starts: ExportImpactEntry[];
}

/**
 * Where a file falls (VSA §1, §3, §5): the region kinds of the architecture
 * check, plus "test" for a test file, whose owner is the slice its claims
 * match or null.
 */
export const OWNERSHIP_REGIONS = [
  "slice",
  "composition",
  "shared",
  "infrastructure",
  "resource",
  "backend",
  "unowned",
  "test",
] as const;
export type OwnershipRegion = (typeof OWNERSHIP_REGIONS)[number];

export interface OwnershipEntry {
  path: string;
  region: OwnershipRegion;
  /** The slice ID for "slice" and "test", the resource ID for "resource", otherwise null. */
  owner: string | null;
}

/** `reports.ownership`: every file the architecture check attributed, at the envelope's snapshot (L2 and above). */
export interface OwnershipReportSection {
  commit: string | null;
  graphHash: string;
  /** Sorted by path. Files outside the source and backend roots that nothing claims are not listed. */
  files: OwnershipEntry[];
  /** Files left out because the slice that owns them is withheld. */
  withheld: number;
}

export interface ExportReports {
  evidence?: EvidenceReportSection;
  knowledge?: KnowledgeReportSection;
  impact?: ImpactReportSection;
  ownership?: OwnershipReportSection;
}

export interface ExportEnvelope {
  contract: typeof EXPORT_CONTRACT;
  spec: typeof SPEC_VERSION;
  generatedAt: string;
  /** Stable identity of the repository, from config (e.g. "intentset/intentset"). */
  repository: string;
  /** Product artifact IDs in the export, sorted. */
  products: string[];
  source: {
    /** The commit the export describes, or null with a reason when none could be read. */
    commit: string | null;
    commitUnavailable?: string;
    /** True when tracked files differed from the commit, so the commit alone does not describe what was read. */
    uncommitted: boolean;
  };
  /** SHA-256 over the canonical graph (ADR 0005), withheld artifacts included: it names the snapshot, not the projection. */
  graphHash: string;
  release: { product: string; label: string } | null;
  validation: {
    level: Level;
    scope: string[];
    status: "pass" | "fail";
    /** Totals over the whole validation, withheld artifacts included, so the status is never flattered. */
    errors: number;
    warnings: number;
    /** The diagnostics about exported artifacts; those about withheld ones are counted in `withholding`. */
    diagnostics: Diagnostic[];
  };
  /** What the export leaves out, so a short export never reads as a complete one. */
  withholding: {
    /** The visibilities withheld: ["restricted"] by default, [] when restricted artifacts were asked for. */
    visibilities: Visibility[];
    artifacts: number;
    diagnostics: number;
  };
  registries: Registries;
  artifacts: ExportArtifact[];
  /** Optional report sections. Absent means "not supplied", never zero or pass. */
  reports: ExportReports;
}
