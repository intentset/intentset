/**
 * tests/publication.json, run the way a publication driver will run it:
 * expandCase, core validation, bindReviewPins, publish. Codes are compared as
 * a multiset over validation and publication diagnostics together; the
 * published IDs must match exactly, and no forbidden text may appear anywhere
 * in what was written or reported.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { validateSchema } from "@intentset/conformance";
import { outputText, readCases, root, run } from "./harness.ts";

const cases = readCases();

test("tests/publication.json follows the conformance schema and names each case once", () => {
  const schema = JSON.parse(readFileSync(join(root, "spec", "conformance.schema.json"), "utf8"));
  assert.deepEqual(validateSchema(schema, cases), []);
  const names = cases.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const c of cases) assert.equal(c.section, "publication");
  for (const id of ["P01", "P02", "P03", "P04", "P05", "P06"]) {
    assert.ok(
      names.some((name) => name.startsWith(`${id} `)),
      `no case for catalog ${id}`,
    );
  }
});

for (const testCase of cases) {
  test(testCase.name, () => {
    const { diagnostics, result } = run(testCase);
    const all = [...diagnostics, ...result.diagnostics];
    const describe = all.map((d) => `${d.code} ${d.origin} ${d.artifact ?? "-"}: ${d.message}`).join("\n");
    assert.deepEqual(all.map((d) => d.code).sort(), [...(testCase.diagnostics ?? [])].sort(), describe);
    assert.equal(!all.some((d) => d.severity === "error"), testCase.valid, describe);
    for (const d of result.diagnostics) assert.equal(d.origin, "publication");
    if (testCase.published?.ids !== undefined) {
      assert.deepEqual(result.index.published, [...testCase.published.ids].sort());
      assert.deepEqual(
        result.documents.map((document) => document.id),
        [...testCase.published.ids].sort(),
      );
    }
    const text = outputText(result);
    for (const required of testCase.published?.mustContain ?? []) {
      assert.ok(text.includes(required), `output lacks ${JSON.stringify(required)}`);
    }
    for (const forbidden of testCase.published?.mustNotContain ?? []) {
      assert.ok(!text.includes(forbidden), `output contains ${JSON.stringify(forbidden)}`);
    }
  });
}
