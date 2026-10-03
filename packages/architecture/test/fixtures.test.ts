/**
 * tests/vsa.json run through the pipeline the harness's `vsa` driver will
 * use: expandCase from the conformance package, `.md` files through core's
 * plainCarrier and validate at the case's level, registries through
 * readRegistries, and every file (documents and sources) handed to
 * checkArchitecture as the tree, since claims may name documents too.
 * The case's code multiset is compared with core's and the architecture's
 * diagnostics together, which is what a section driver reports.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  type Diagnostic,
  type DocumentInput,
  EMPTY_REGISTRIES,
  parseYaml,
  plainCarrier,
  readRegistries,
  type Registries,
  validate,
} from "@intentset/core";
import { expandCase, REGISTRIES_PATH } from "../../conformance/src/fixtures.ts";
import type { ConformanceCase, ExpandedCase } from "../../conformance/src/types.ts";
import { type ArchitectureResult, checkArchitecture } from "../src/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const cases = JSON.parse(readFileSync(join(ROOT, "tests", "vsa.json"), "utf8")) as ConformanceCase[];

export interface VsaRun {
  diagnostics: Diagnostic[];
  architecture: ArchitectureResult;
}

/** The vsa driver, as the harness will wire it. Exceptions expire against a fixed date so the run is reproducible. */
export function runVsa(expanded: ExpandedCase): VsaRun {
  const inputs: DocumentInput[] = [];
  for (const [path, source] of expanded.files) if (path.endsWith(".md")) inputs.push(plainCarrier(path, source));
  let registries: Registries = EMPTY_REGISTRIES;
  const extra: Diagnostic[] = [];
  if (expanded.registriesText !== null) {
    const read = readRegistries(expanded.registriesText, REGISTRIES_PATH);
    registries = read.registries;
    extra.push(...read.diagnostics);
  }
  const result = validate(inputs, registries, { level: expanded.level });
  const files = new Map([...expanded.files, ...expanded.sources]);
  const architecture = checkArchitecture(
    result.graph,
    registries,
    { files },
    { level: expanded.level, today: "2026-10-02" },
  );
  return { diagnostics: [...result.diagnostics, ...extra, ...architecture.diagnostics], architecture };
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code).sort();
}

test("tests/vsa.json is one section with unique names", () => {
  assert.ok(cases.length > 0);
  const names = new Set<string>();
  for (const testCase of cases) {
    assert.equal(testCase.section, "vsa");
    assert.ok(!names.has(testCase.name), `duplicate name ${testCase.name}`);
    names.add(testCase.name);
  }
});

for (const testCase of cases) {
  test(`vsa: ${testCase.name}`, () => {
    const expanded = expandCase(testCase, { examplesDir: join(ROOT, "examples"), parseYaml });
    const { diagnostics, architecture } = runVsa(expanded);
    const shown = diagnostics
      .map((d) => `${d.severity} ${d.code} ${d.path ?? "-"}${d.location ? `:${d.location.line}` : ""} ${d.message}`)
      .join("\n");
    assert.deepEqual(codes(diagnostics), [...(testCase.diagnostics ?? [])].sort(), shown);
    assert.equal(!diagnostics.some((d) => d.severity === "error"), testCase.valid, shown);
    for (const d of architecture.diagnostics) assert.equal(d.origin, "architecture");
  });
}

test("VSA003 names the entrypoint in the importer's own package first, since that is the surface it should use", () => {
  const testCase = cases.find((c) => c.name === "VSA003 a consumer reaches past the entrypoint its own package holds")!;
  const { architecture } = runVsa(expandCase(testCase, { examplesDir: join(ROOT, "examples"), parseYaml }));
  const [d] = architecture.diagnostics.filter((x) => x.code === "VSA003");
  assert.match(
    d.message,
    /; its public surface in the package at apps\/web is apps\/web\/src\/features\/results\/index\.ts, and elsewhere src\/features\/assessment\/results\/index\.ts\.$/,
  );
  assert.match(d.remediation, /^Import apps\/web\/src\/features\/results\/index\.ts and /);
});
