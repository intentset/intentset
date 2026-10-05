/**
 * Every case in tests/core.json and tests/export.json, run through the
 * pipeline the conformance harness's drivers run, so core's fixtures are
 * proved true by core's own suite. The fixture files themselves are checked
 * against spec/conformance.schema.json and spec/export.schema.json.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { SPEC_DIR, codes, expandCase, firstMismatch, loadSection, readJson, runCase } from "./cases.ts";
import { type Schema, validateSchema } from "./schema.ts";

const conformanceSchema = readJson(join(SPEC_DIR, "conformance.schema.json")) as Schema;
const exportSchema = readJson(join(SPEC_DIR, "export.schema.json")) as Schema;

for (const section of ["core", "export"]) {
  const cases = loadSection(section);

  test(`tests/${section}.json is a valid conformance file`, () => {
    assert.deepEqual(validateSchema(conformanceSchema, cases), []);
    assert.ok(cases.every((c) => c.section === section));
    assert.equal(new Set(cases.map((c) => c.name)).size, cases.length, "case names are unique");
  });

  for (const testCase of cases) {
    // Core reads plainly and has no Markdown parser (CLAUDE.md invariant 8), so a
    // case about what Markset reports is the harness's to run, with the adapter.
    const skip = testCase.carrier === "markset" && "read with the Markset carrier; the conformance harness runs it";
    test(`${section}: ${testCase.name}`, { skip }, () => {
      const run = runCase(expandCase(testCase));
      assert.deepEqual(codes(run.diagnostics), [...(testCase.diagnostics ?? [])].sort());
      assert.equal(!run.diagnostics.some((d) => d.severity === "error"), testCase.valid);
      if (testCase.artifacts !== undefined) {
        assert.deepEqual([...run.result.graph.artifacts.keys()].sort(), testCase.artifacts);
      }
      if (testCase.export !== undefined) {
        assert.equal(firstMismatch(testCase.export, JSON.parse(JSON.stringify(run.envelope))), null);
      }
      // Every envelope, whatever the case, is an envelope the export schema accepts.
      assert.deepEqual(validateSchema(exportSchema, JSON.parse(JSON.stringify(run.envelope))), []);
    });
  }
}

test("the catalog's C01 to C09 each prefix at least one core case", () => {
  const names = loadSection("core").map((c) => c.name);
  for (let i = 1; i <= 9; i++) {
    const id = `C0${i}`;
    assert.ok(
      names.some((n) => n.startsWith(`${id} `)),
      `no case for ${id}`,
    );
  }
});
