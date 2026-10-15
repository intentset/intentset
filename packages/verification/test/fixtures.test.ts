/**
 * tests/evidence.json, run the way the harness's evidence driver runs it:
 * expandCase, core's validation at the case's level, then
 * checkFixtureEvidence. Codes are compared as multisets, like the harness.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { subjectSource } from "@intentset/architecture";
import { type Schema, validateSchema } from "../../conformance/src/harness.ts";
import {
  checkFixtureEvidence,
  type EvidenceStatus,
  hasSliceClaims,
  readRunRecords,
  resolveBinding,
} from "../src/index.ts";
import { type ConformanceCase, codes, expand, readJson, SPEC_DIR, TESTS_DIR, validateExpanded } from "./helpers.ts";

const cases = readJson(join(TESTS_DIR, "evidence.json")) as ConformanceCase[];

function run(testCase: ConformanceCase) {
  const expanded = expand(testCase);
  const validated = validateExpanded(expanded);
  const files = new Map([...expanded.files, ...expanded.sources]);
  const subject =
    resolveBinding(validated.evidence.binding, hasSliceClaims(validated.graph)).binding === "subject"
      ? subjectSource(
          validated.graph,
          validated.registries,
          { files },
          {
            globalInputs: validated.evidence.globalInputs,
            resources: validated.evidence.resources,
            readFile: (path) => (files.has(path) ? Buffer.from(files.get(path) as string) : undefined),
          },
        )
      : undefined;
  const evidence = checkFixtureEvidence({
    graph: validated.graph,
    level: expanded.level,
    evidence: expanded.evidence,
    request: expanded.request,
    documents: expanded.files.keys(),
    sources: expanded.sources.keys(),
    configuredBinding: validated.evidence.binding,
    changedSince: expanded.changedSince,
    ...(subject === undefined ? {} : { subjectSource: subject }),
  });
  return { expanded, evidence, diagnostics: [...validated.diagnostics, ...evidence.diagnostics] };
}

/** What each case means for the example's review, beyond its codes. */
const REVIEW_STATUS: Record<string, EvidenceStatus> = {
  "E01 current pass at L1 is a current pass and reports nothing": "current-pass",
  "E01 current pass at L3 verifies every claim the review links": "current-pass",
  "E01 draft claims need no evidence at L3": "missing",
  "E02 pass at an older commit is stale": "stale",
  "E02 pass at an older graph hash is stale": "stale",
  "E02 stale pass below L3 is not a diagnostic": "stale",
  "E03 skipped review at the snapshot is not a pass": "skip",
  "E03 errored review at the snapshot is not a pass": "error",
  "E03 missing evidence fails every approved claim": "missing",
  "E04 prior pass followed by a current fail stays failing": "current-fail",
  "E04 stale pass followed by a current fail stays failing": "current-fail",
  "E04 a pass recorded after the failure at the same snapshot is current": "current-pass",
  "E04 runs that finish together are ordered by evidence ID": "current-fail",
  "E04 fractional seconds order runs exactly": "current-fail",
  "EVID001 run of a manual verification without a reviewer": "missing",
  "EVID001 malformed pass never counts as evidence at L3": "missing",
  "Scope a pass for another release is ignored": "missing",
  "Scope a fail for another release does not hide the in-scope pass": "current-pass",
  "Automated verification passing at the snapshot verifies its claims": "current-pass",
  "S01 a subject record stays current across an unrelated commit": "current-pass",
  "S01 a subject record stays current across a prose edit of a slice record": "current-pass",
  "S01 a subject record stays current across an edit of an unrelated record": "current-pass",
  "S01 a subject record stays current across a change to a file of a resource a slice lists but no check exercises":
    "current-pass",
  "S02 a change to a file the verified behavior's slice claims makes a subject record stale": "stale",
  "S02 a change to a file a claim of the slice resolves to by another claim makes a subject record stale": "stale",
  "S02 a change to a dependency slice's file makes a subject record stale": "stale",
  "S02 a change to the test file makes a subject record stale": "stale",
  "S02 a change to a locally imported helper makes a subject record stale": "stale",
  "S02 a change to an exercised slice's file makes a subject record stale": "stale",
  "S02 a change to an exercised resource's file makes a subject record stale": "stale",
  "S02 a change to a used resource's file makes a subject record stale": "stale",
  "S02 a change to an unclaimed file of a resource the implementing slice claims into makes a subject record stale":
    "stale",
  "S02 a change to a global input makes a subject record stale": "stale",
  "S02 a change to the verified behavior's text makes a subject record stale": "stale",
  "S02 a change to a binding field of a slice record makes a subject record stale": "stale",
  "S03 a record bound to a commit is stale under subject binding": "stale",
  "S03 a subject record is stale under commit binding": "stale",
  "S04 a repository with no slice claims is judged by commit binding, and says so": "current-pass",
  "S04 choosing commit binding where no slice claims files is not reported": "current-pass",
  "S05 a file no slice claims and no check names, changed since the record's commit, is reported": "current-pass",
  "S05 files that only claimed, used or declared inputs cover are not reported": "current-pass",
  "S05 files that only claimed, exercised or declared inputs cover are not reported": "current-pass",
  "S06 a resource a slice lists and no check exercises changed since the record's commit: the record stays current and the report says what the binding could not see":
    "current-pass",
  "S05 a record's commit that is not an ancestor of the snapshot cannot be listed, and the report says so without failing":
    "current-pass",
};

describe("tests/evidence.json", () => {
  test("is a valid conformance file with unique names, section evidence and catalog cases E01-E04", () => {
    const schema = readJson(join(SPEC_DIR, "conformance.schema.json")) as Schema;
    assert.deepEqual(validateSchema(schema, cases), []);
    assert.equal(new Set(cases.map((c) => c.name)).size, cases.length);
    for (const testCase of cases) assert.equal(testCase.section, "evidence");
    for (const id of ["E01", "E02", "E03", "E04"]) {
      assert.ok(
        cases.some((c) => c.name.startsWith(`${id} `)),
        `no case for ${id}`,
      );
    }
    assert.ok(cases.length >= 20, `only ${cases.length} cases`);
  });

  test("every evidence array that the reader accepts also satisfies spec/evidence.schema.json", () => {
    const schema = readJson(join(SPEC_DIR, "evidence.schema.json")) as Schema;
    for (const testCase of cases) {
      const evidence = testCase.evidence ?? [];
      const read = readRunRecords(evidence, "evidence.json");
      if (read.diagnostics.length === 0) assert.deepEqual(validateSchema(schema, evidence), [], testCase.name);
    }
  });

  for (const testCase of cases) {
    test(testCase.name, () => {
      const { evidence, diagnostics } = run(testCase);
      assert.deepEqual(
        codes(diagnostics),
        [...(testCase.diagnostics ?? [])].sort(),
        JSON.stringify(diagnostics, null, 1),
      );
      assert.equal(!diagnostics.some((d) => d.severity === "error"), testCase.valid);
      for (const d of evidence.diagnostics) assert.equal(d.origin, "evidence");
      const expected = REVIEW_STATUS[testCase.name];
      if (expected !== undefined) {
        assert.equal(evidence.classification.verifications["TEST-ASMT-SCHEDULE"]?.status, expected);
      }
    });
  }

  test("the out-of-scope record is counted, not dropped silently", () => {
    const testCase = cases.find((c) => c.name === "Scope a pass for another release is ignored");
    assert.ok(testCase);
    const { evidence } = run(testCase);
    assert.equal(evidence.classification.ignoredOutOfScope, 1);
    assert.equal(evidence.classification.verifications["TEST-ASMT-SCHEDULE"].outOfScope, 1);
  });

  test("a failure followed by a pass at the snapshot stays countable", () => {
    const testCase = cases.find((c) => c.name.startsWith("E04 a pass recorded after the failure"));
    assert.ok(testCase);
    const review = run(testCase).evidence.classification.verifications["TEST-ASMT-SCHEDULE"];
    assert.deepEqual(review.atSnapshot, { pass: 1, fail: 1, skip: 0, error: 0 });
    assert.deepEqual(
      review.history.map((r) => r.result),
      ["fail", "pass"],
    );
  });

  test("a case without sources leaves its locators unresolved rather than passed", () => {
    const testCase = cases.find((c) => c.name.startsWith("E01 current pass at L1"));
    assert.ok(testCase);
    const { coverage } = run(testCase).evidence;
    assert.ok(coverage.unresolved.some((u) => u.subject === "TEST-ASMT-SCHEDULE" && u.reason.includes("locator")));
  });
});
