/**
 * Core's own run of its conformance cases (ADR 0006). Expansion is the
 * harness's (packages/conformance/src/fixtures.ts), so there is one patch
 * implementation; this file adds only the pipeline the harness's core and
 * export drivers run: plainCarrier, readRegistries, readConfig, validate and
 * exportGraph, with the same fixed export metadata.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expandCase as expandWith } from "../../conformance/src/fixtures.ts";
import type { ConformanceCase, ExpandedCase } from "../../conformance/src/types.ts";
import {
  type Diagnostic,
  type DocumentInput,
  EMPTY_REGISTRIES,
  type ExportEnvelope,
  type Registries,
  type ValidationResult,
  exportGraph,
  parseYaml,
  plainCarrier,
  readConfig,
  readRegistries,
  validate,
} from "../src/index.ts";

export type { ConformanceCase, ExpandedCase };
export { firstMismatch } from "../../conformance/src/compare.ts";

export const REPO_ROOT = resolve(import.meta.dirname, "../../..");
export const EXAMPLES_DIR = join(REPO_ROOT, "examples");
export const TESTS_DIR = join(REPO_ROOT, "tests");
export const SPEC_DIR = join(REPO_ROOT, "spec");

/** The harness's FIXTURE_META, restated so a core test does not import its drivers. */
export const FIXTURE_META = {
  repository: "example/scheduling",
  commit: null,
  commitUnavailable: "fixture",
  generatedAt: "2026-01-01T00:00:00Z",
} as const;

export function loadSection(section: string): ConformanceCase[] {
  return JSON.parse(readFileSync(join(TESTS_DIR, `${section}.json`), "utf8")) as ConformanceCase[];
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function expandCase(testCase: ConformanceCase): ExpandedCase {
  return expandWith(testCase, { examplesDir: EXAMPLES_DIR, parseYaml });
}

export interface Run {
  inputs: DocumentInput[];
  registries: Registries;
  result: ValidationResult;
  /** Validation diagnostics plus those of the registries and config, as the harness folds them. */
  diagnostics: Diagnostic[];
  envelope: ExportEnvelope;
}

export function runCase(expanded: ExpandedCase): Run {
  const inputs: DocumentInput[] = [];
  for (const [path, source] of expanded.files) {
    if (path.endsWith(".md")) inputs.push(plainCarrier(path, source));
  }
  const extra: Diagnostic[] = [];
  let registries: Registries = EMPTY_REGISTRIES;
  if (expanded.registriesText !== null) {
    const read = readRegistries(expanded.registriesText, "registries.yaml");
    registries = read.registries;
    extra.push(...read.diagnostics);
  }
  if (expanded.configText !== null)
    extra.push(...readConfig(expanded.configText, ".intentset/config.yaml").diagnostics);
  const result = validate(inputs, registries, { level: expanded.level });
  const envelope = exportGraph(result, registries, FIXTURE_META);
  return { inputs, registries, result, diagnostics: [...result.diagnostics, ...extra], envelope };
}

export function codes(diagnostics: readonly { code: string }[]): string[] {
  return diagnostics.map((d) => d.code).sort();
}
