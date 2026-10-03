/**
 * Shared test setup: the scheduling example expanded through the harness's
 * own expander and validated through core's pipeline, exactly as the
 * conformance driver does it, so unit tests and fixtures see the same graph.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type Diagnostic,
  type DocumentInput,
  EMPTY_REGISTRIES,
  type Graph,
  graphHash,
  type Level,
  parseYaml,
  plainCarrier,
  type Registries,
  readConfig,
  readRegistries,
  validate,
} from "@intentset/core";
import { CONFIG_PATH, expandCase, REGISTRIES_PATH } from "../../conformance/src/fixtures.ts";
import type { ConformanceCase, ExpandedCase } from "../../conformance/src/types.ts";
import type { RunRecord } from "../src/index.ts";

export type { ConformanceCase, ExpandedCase };

export const REPO_ROOT = resolve(import.meta.dirname, "../../..");
export const EXAMPLES_DIR = join(REPO_ROOT, "examples");
export const TESTS_DIR = join(REPO_ROOT, "tests");
export const SPEC_DIR = join(REPO_ROOT, "spec");

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function expand(testCase: ConformanceCase): ExpandedCase {
  return expandCase(testCase, { examplesDir: EXAMPLES_DIR, parseYaml });
}

export interface Validated {
  graph: Graph;
  registries: Registries;
  /** Validation's diagnostics plus those of the registries and config, as the harness folds them. */
  diagnostics: Diagnostic[];
}

/** The harness's validateTree, restated so a test does not import its drivers. */
export function validateExpanded(expanded: ExpandedCase): Validated {
  const inputs: DocumentInput[] = [];
  for (const [path, source] of expanded.files) {
    if (path.endsWith(".md")) inputs.push(plainCarrier(path, source));
  }
  const extra: Diagnostic[] = [];
  let registries: Registries = EMPTY_REGISTRIES;
  if (expanded.registriesText !== null) {
    const read = readRegistries(expanded.registriesText, REGISTRIES_PATH);
    registries = read.registries;
    extra.push(...read.diagnostics);
  }
  if (expanded.configText !== null) extra.push(...readConfig(expanded.configText, CONFIG_PATH).diagnostics);
  const result = validate(inputs, registries, { level: expanded.level });
  return { graph: result.graph, registries, diagnostics: [...result.diagnostics, ...extra] };
}

const CLAIMS = ["BEH-ASMT-SCHEDULE.md", "RULE-ASMT-AUTH.md", "RULE-ASMT-FUTURE.md", "SCN-ASMT-SCHEDULE.md"];

/** The scheduling example's graph, optionally with its four claims approved and further patches applied. */
export function exampleGraph(
  options: {
    approve?: boolean;
    patch?: ConformanceCase["patch"];
    files?: ConformanceCase["files"];
    level?: Level;
  } = {},
): { graph: Graph; hash: string } {
  const patch: NonNullable<ConformanceCase["patch"]> = {};
  if (options.approve) {
    for (const file of CLAIMS) patch[file] = { frontmatter: { "intentset.status": "approved" } };
  }
  for (const [file, edit] of Object.entries(options.patch ?? {})) {
    patch[file] = { frontmatter: { ...patch[file]?.frontmatter, ...edit.frontmatter } };
  }
  const expanded = expand({
    section: "evidence",
    name: "unit",
    baseline: "scheduling",
    patch,
    files: options.files,
    level: options.level,
    valid: true,
  });
  const { graph, diagnostics } = validateExpanded(expanded);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new Error(`example does not validate: ${errors.map((d) => d.message).join(" | ")}`);
  return { graph, hash: graphHash(graph) };
}

export const COMMIT = "abcdef0123456789abcdef0123456789abcdef01";
export const OLD_COMMIT = "0000000000000000000000000000000000000001";
export const OLD_HASH = "0".repeat(64);

let serial = 0;

/** A well-formed manual review record of TEST-ASMT-SCHEDULE, at the given hash and COMMIT unless overridden. */
export function review(hash: string, overrides: Partial<RunRecord> = {}): RunRecord {
  serial++;
  return {
    evidenceId: `EV-T-${String(serial).padStart(3, "0")}`,
    verificationId: "TEST-ASMT-SCHEDULE",
    commit: COMMIT,
    graphHash: hash,
    environment: "pilot",
    scope: { product: "PRD-LANTERN", release: "pilot-1" },
    tool: null,
    reviewer: "reviewer-ana",
    startedAt: "2026-09-30T09:00:00Z",
    finishedAt: "2026-09-30T09:45:00Z",
    result: "pass",
    uri: "https://evidence.example/lantern/review",
    rationale: "Ran the procedure and observed the expected result.",
    ...overrides,
  };
}

/** An automated record (tool, no reviewer) for the given verification. */
export function automatedRun(hash: string, overrides: Partial<RunRecord> = {}): RunRecord {
  const record = review(hash, { tool: { name: "node:test", version: "v24.15.0" }, reviewer: null, ...overrides });
  if (!("rationale" in overrides)) delete record.rationale;
  return record;
}

/** Code multiset as a sorted list, for comparison. */
export function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code).sort();
}
