/**
 * What a publication driver does with one expanded case: validate the tree
 * with core and the plain carrier, as the conformance drivers do, bind the
 * `@current` review pins, and publish with a fixed snapshot and timestamp.
 * Shared by the fixture test and the unit tests that start from the example.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type Diagnostic,
  type DocumentInput,
  EMPTY_REGISTRIES,
  type Graph,
  type Registries,
  graphHash,
  parseYaml,
  plainCarrier,
  readRegistries,
  validate,
} from "@intentset/core";
import { expandCase } from "@intentset/conformance";
import { type PublicationRequest, type PublishResult, bindReviewPins, publish } from "../src/index.ts";

export const root = resolve(import.meta.dirname, "..", "..", "..");
export const examplesDir = join(root, "examples");
export const PUBLISHED_AT = "2026-01-01T00:00:00Z";

export interface PublicationCase {
  section: string;
  name: string;
  baseline?: string;
  files?: Record<string, string | null>;
  patch?: Record<string, { frontmatter?: Record<string, unknown>; body?: string }>;
  registries?: Record<string, unknown>;
  request?: Record<string, unknown>;
  valid: boolean;
  diagnostics?: string[];
  published?: { ids?: string[]; mustContain?: string[]; mustNotContain?: string[] };
  notes?: string;
}

export function readCases(): PublicationCase[] {
  return JSON.parse(readFileSync(join(root, "tests", "publication.json"), "utf8")) as PublicationCase[];
}

export interface Built {
  graph: Graph;
  registries: Registries;
  /** Validation and registry diagnostics. */
  diagnostics: Diagnostic[];
}

/** Expand a case and validate it, then bind its review pins. */
export function build(testCase: PublicationCase): Built {
  const expanded = expandCase(testCase as Parameters<typeof expandCase>[0], { examplesDir, parseYaml });
  const inputs: DocumentInput[] = [];
  for (const [path, source] of expanded.files) if (path.endsWith(".md")) inputs.push(plainCarrier(path, source));
  const diagnostics: Diagnostic[] = [];
  let registries: Registries = EMPTY_REGISTRIES;
  if (expanded.registriesText !== null) {
    const read = readRegistries(expanded.registriesText, "registries.yaml");
    registries = read.registries;
    diagnostics.push(...read.diagnostics);
  }
  const result = validate(inputs, registries);
  diagnostics.push(...result.diagnostics);
  return { graph: bindReviewPins(result.graph), registries, diagnostics };
}

/** Build and publish one case with the fixture snapshot. */
export function run(
  testCase: PublicationCase,
  options: { renderHtml?: boolean } = {},
): Built & { result: PublishResult } {
  const built = build(testCase);
  const result = publish(built.graph, built.registries, (testCase.request ?? {}) as unknown as PublicationRequest, {
    snapshot: { commit: null, graphHash: graphHash(built.graph) },
    publishedAt: PUBLISHED_AT,
    renderHtml: options.renderHtml ?? true,
  });
  return { ...built, result };
}

/** Every byte the publication wrote or reported: documents, pages, index, help file and diagnostics. */
export function outputText(result: PublishResult): string {
  return [
    ...result.documents.flatMap((document) => [document.markset, document.html ?? ""]),
    JSON.stringify(result.index),
    JSON.stringify(result.help),
    JSON.stringify(result.diagnostics),
  ].join("\n");
}

export const KB_PATH = "KB-ASMT-SCHEDULE.md";
export const ALL_CURRENT = {
  "BEH-ASMT-SCHEDULE": "@current",
  "RULE-ASMT-AUTH": "@current",
  "RULE-ASMT-FUTURE": "@current",
};

/** Frontmatter edits that make the example's knowledge approved and reviewed against the given pins. */
export function reviewed(
  extra: Record<string, unknown> = {},
  pins: Record<string, string> = ALL_CURRENT,
): Record<string, unknown> {
  return {
    "intentset.status": "approved",
    "intentset.reviewedBy": "team-assessment",
    "intentset.reviewedAt": "2026-09-30",
    "intentset.extensions": { "intentset.org/review": { sources: pins } },
    ...extra,
  };
}

/** The customer request the example's knowledge is written for. */
export function customer(extra: Record<string, unknown> = {}): PublicationRequest {
  return {
    visibility: "customer",
    audience: "teacher",
    product: "PRD-LANTERN",
    release: "pilot-1",
    role: "teacher",
    edition: "standard",
    flags: [],
    ...extra,
  } as PublicationRequest;
}

/** The example with its edits, as a case with no expectations. */
export function example(
  fields: Pick<PublicationCase, "files" | "patch" | "registries"> & {
    kb?: Record<string, unknown>;
    body?: string;
  } = {},
): Built {
  const patch = { ...(fields.patch ?? {}) };
  if (fields.kb !== undefined || fields.body !== undefined) {
    patch[KB_PATH] = {
      frontmatter: fields.kb ?? reviewed(),
      ...(fields.body !== undefined ? { body: fields.body } : {}),
    };
  }
  return build({
    section: "publication",
    name: "unit",
    baseline: "scheduling",
    files: fields.files,
    patch,
    registries: fields.registries,
    valid: true,
  });
}

/** A knowledge body with the example's heading and section around the given guidance. */
export function guidance(text: string): string {
  return `\n# Prepare a scheduled student assessment\n\n## Guidance\n\n${text}\n`;
}

/** The fixture snapshot of a graph. */
export function snapshotOf(graph: Graph): { commit: string | null; graphHash: string } {
  return { commit: null, graphHash: graphHash(graph) };
}
