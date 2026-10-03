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
  capability: ["outcome", "capability"],
  behavior: ["capability"],
};

/** Required level-two headings per type, Core §6. */
export const REQUIRED_SECTIONS: Record<ArtifactType, readonly string[]> = {
  product: ["Scope"],
  intent: ["Rationale"],
  outcome: ["Measure"],
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
  entrypoint: string;
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
  slice?: SliceMeta;
  verification?: VerificationMeta;
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
  resources: Resource[];
}

export const EMPTY_REGISTRIES: Registries = {
  owners: [],
  audiences: [],
  releases: [],
  roles: [],
  editions: [],
  flags: [],
  resources: [],
};

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

/** The versioned export envelope (integration contract; spec/export.schema.json). */
export const EXPORT_CONTRACT = "intentset/export/0.1";

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
  parent: string | null;
  links: Partial<Record<Exclude<LinkKind, "parent">, string[]>>;
  /** Inverse edges, keyed by the authored kind, marked derived by living here. */
  derived: Partial<Record<LinkKind, string[]>>;
  availability: Availability | null;
  slice: SliceMeta | null;
  verification: VerificationMeta | null;
  extensions: Record<string, unknown> | null;
  /** Present only when the export was asked to include bodies. */
  body?: string;
}

export interface ExportEnvelope {
  contract: typeof EXPORT_CONTRACT;
  spec: typeof SPEC_VERSION;
  generatedAt: string;
  /** Stable identity of the repository, from config (e.g. "intentset/intentset"). */
  repository: string;
  products: string[];
  source: {
    /** The commit the export describes, or null with a reason when none could be read. */
    commit: string | null;
    commitUnavailable?: string;
  };
  /** SHA-256 over the canonical graph (ADR 0005). */
  graphHash: string;
  release: { product: string; label: string } | null;
  validation: {
    level: Level;
    scope: string[];
    status: "pass" | "fail";
    errors: number;
    warnings: number;
    diagnostics: Diagnostic[];
  };
  registries: Registries;
  artifacts: ExportArtifact[];
  /** Optional report sections. Absent means "not supplied", never zero or pass. */
  reports?: {
    evidence?: unknown;
    knowledge?: unknown;
    impact?: unknown;
  };
}
