import type { Diagnostic, Level } from "@intentset/core";
import type { SchemaError } from "./schema.ts";

/** A publication request, spec/conformance.schema.json `request`. */
export interface PublicationRequest {
  audience?: string;
  visibility?: "public" | "customer" | "internal" | "restricted";
  product?: string;
  release?: string;
  role?: string;
  edition?: string;
  flags?: string[];
  ids?: string[];
}

/** One edit to a baseline document: dotted-path frontmatter changes and an optional body. */
export interface Patch {
  frontmatter?: Record<string, unknown>;
  body?: string;
}

/** One entry in a tests/<section>.json file. Shape is governed by spec/conformance.schema.json. */
export interface ConformanceCase {
  section: string;
  name: string;
  baseline?: string;
  files?: Record<string, string | null>;
  patch?: Record<string, Patch>;
  registries?: Record<string, unknown>;
  sources?: Record<string, string | null>;
  config?: Record<string, unknown>;
  level?: Level;
  evidence?: Record<string, unknown>[];
  request?: PublicationRequest;
  valid: boolean;
  diagnostics?: string[];
  artifacts?: string[];
  export?: Record<string, unknown>;
  published?: { ids?: string[]; mustContain?: string[]; mustNotContain?: string[] };
  notes?: string;
}

/**
 * A case with its baseline, files and patches resolved into a repository
 * tree. This is what a driver receives, and what the published suite ships.
 */
export interface ExpandedCase {
  /** Documents by repository-relative POSIX path, sorted. Never registries or config. */
  files: Map<string, string>;
  /** The text of registries.yaml, or null when the tree has none. */
  registriesText: string | null;
  /** The text of .intentset/config.yaml, or null when the tree has none. */
  configText: string | null;
  /** Non-document files for VSA and evidence cases, sorted. */
  sources: Map<string, string>;
  level: Level;
  evidence: Record<string, unknown>[];
  request: PublicationRequest | null;
}

/**
 * What a section driver observed for one case. Fields left undefined are
 * reported as skipped rather than failed, so cases can be written ahead of
 * the code that satisfies them.
 */
export interface Actual {
  valid: boolean;
  /** Every diagnostic emitted, errors and warnings alike. Codes are compared; the rest is shown on failure. */
  diagnostics: Diagnostic[];
  /** Artifact IDs in the graph, in any order. */
  artifacts?: string[];
  /** The export envelope. */
  export?: unknown;
  /** Publication output: the knowledge IDs published and every byte of text written. */
  published?: { ids: string[]; text: string };
  /** Driver-level failures that are not tied to an expected field. */
  problems?: string[];
}

export type Driver = (expanded: ExpandedCase, testCase: ConformanceCase) => Actual | Promise<Actual>;

export type Aspect = "valid" | "diagnostics" | "artifacts" | "export" | "published" | "driver" | "fixture";
export type Status = "pass" | "fail" | "skip";

export interface AspectResult {
  aspect: Aspect;
  status: Status;
  detail?: string;
}

export interface CaseResult {
  index: number;
  name: string;
  aspects: AspectResult[];
}

export interface FileResult {
  file: string;
  section: string;
  /** Problems with the file itself: unreadable, invalid JSON, section mismatch, duplicate names. */
  fileErrors: string[];
  schemaErrors: SchemaError[];
  cases: CaseResult[];
}

export interface Totals {
  pass: number;
  fail: number;
  skip: number;
}

export interface SectionTotals extends Totals {
  section: string;
  cases: number;
  /** True when the file itself was malformed, which fails the run regardless of the counts. */
  malformed: boolean;
}

export interface SuiteResult {
  files: FileResult[];
  totals: Totals;
}
