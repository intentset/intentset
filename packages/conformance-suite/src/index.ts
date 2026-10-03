/**
 * The Intentset conformance cases, as data.
 *
 * This package carries no validator, no graph and no opinion about how an
 * implementation is built. It is the suite an implementation is checked
 * against, distributed so that checking does not require cloning the
 * reference implementation's repository.
 *
 * The JSON is the artifact: an implementation in any language reads
 * `cases/*.json`, `schemas/*.json` and `examples/` straight off disk. The
 * functions here are a convenience for JavaScript consumers, not the format.
 *
 * Every case here is expanded (ADR 0006): `files` is the whole repository
 * tree, registries and config included, and there is no baseline or patch to
 * apply. The schema in `schemas/conformance.schema.json` still describes it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** A publication request, for publication cases. */
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

/** One expanded case. The fields are spec/conformance.schema.json's, minus the ones expansion consumed. */
export interface SuiteCase {
  /** Section identifier, equal to the file's basename. */
  section: string;
  /** Unique within the section; catalog cases keep their catalog ID as a prefix. */
  name: string;
  /**
   * The repository tree by relative POSIX path: every document, plus
   * `registries.yaml` and `.intentset/config.yaml` when the case has them.
   */
  files: Record<string, string>;
  /** Non-document files (sources, tsconfig, test output) for VSA and evidence cases. */
  sources?: Record<string, string>;
  /** The conformance level to validate at. Checks above it do not run. */
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  /** Run records supplied to the evidence check. */
  evidence?: Record<string, unknown>[];
  request?: PublicationRequest;
  /** True when no diagnostic is an error. */
  valid: boolean;
  /** Every diagnostic code the case must produce, errors and warnings, as a multiset. Absent means none. */
  diagnostics?: string[];
  /** The artifact IDs that must appear in the graph, sorted. */
  artifacts?: string[];
  /** Fields of the export envelope that must match, as a deep partial. */
  export?: Record<string, unknown>;
  /** Knowledge IDs that must be published and text that must not appear anywhere in the output. */
  published?: { ids?: string[]; mustNotContain?: string[] };
  notes?: string;
}

const packageDir = resolve(import.meta.dirname, "..");

/** Where the packaged cases live, one `<section>.json` each. Pass another directory to read a staged copy. */
export const suitePath: string = join(packageDir, "cases");

/** The normative schemas: the case format, the authoring frontmatter, and the export envelope. */
export const schemaPaths = {
  conformance: join(packageDir, "schemas", "conformance.schema.json"),
  frontmatter: join(packageDir, "schemas", "frontmatter.schema.json"),
  export: join(packageDir, "schemas", "export.schema.json"),
} as const;

/** The worked example the cases are built from, `examples/scheduling`. */
export const examplesPath: string = join(packageDir, "examples");

/** Section names, sorted, as the file basenames. */
export function sections(dir: string = suitePath): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

/** Every case in one section, in file order. */
export function loadSection(section: string, dir: string = suitePath): SuiteCase[] {
  return JSON.parse(readFileSync(join(dir, `${section}.json`), "utf8")) as SuiteCase[];
}

/** Every section's cases, keyed by section name, sections sorted. */
export function loadSuite(dir: string = suitePath): Record<string, SuiteCase[]> {
  const suite: Record<string, SuiteCase[]> = {};
  for (const section of sections(dir)) suite[section] = loadSection(section, dir);
  return suite;
}
