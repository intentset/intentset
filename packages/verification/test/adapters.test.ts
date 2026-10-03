import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { type Schema, validateSchema } from "../../conformance/src/schema.ts";
import {
  classifyEvidence,
  deriveEvidenceId,
  type ParsedRun,
  parseNodeTap,
  parseVitestJson,
  readRunRecords,
  selectorMatches,
  type ToRunRecordsOptions,
  toRunRecords,
} from "../src/index.ts";
import { COMMIT, exampleGraph, readJson, SPEC_DIR } from "./helpers.ts";

const HASH = "b".repeat(64);

/** Captured from `node --test --test-reporter=tap` on Node v24, locations and stacks trimmed. */
const NODE_TAP = `TAP version 13
# Subtest: schedule [schedule-review-v1]
    # Subtest: accepts a future time
    ok 1 - accepts a future time
      ---
      duration_ms: 0.503667
      type: 'test'
      ...
    # Subtest: rejects \\# a past time
    not ok 2 - rejects \\# a past time
      ---
      duration_ms: 0.512292
      type: 'test'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly equal:
        
        1 !== 2
        
      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: 2
      actual: 1
      operator: 'strictEqual'
      stack: |-
        TestContext.<anonymous> (file:///tmp/sample.test.mjs:5:46)
      ...
    # Subtest: throws
    not ok 3 - throws
      ---
      duration_ms: 0.061292
      type: 'test'
      failureType: 'testCodeFailure'
      error: 'boom'
      code: 'ERR_TEST_FAILURE'
      name: 'TypeError'
      stack: |-
        TestContext.<anonymous> (file:///tmp/sample.test.mjs:6:30)
      ...
    # Subtest: skipped one
    ok 4 - skipped one # SKIP
      ---
      duration_ms: 0.056458
      type: 'test'
      ...
    # Subtest: todo one
    ok 5 - todo one # TODO
      ---
      duration_ms: 0.076
      type: 'test'
      ...
    1..5
not ok 1 - schedule [schedule-review-v1]
  ---
  duration_ms: 2.342041
  type: 'suite'
  failureType: 'subtestsFailed'
  error: '2 subtests failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: parent
    # Subtest: child ok
    ok 1 - child ok
      ---
      duration_ms: 0.064042
      type: 'test'
      ...
    1..1
ok 2 - parent
  ---
  duration_ms: 0.224667
  type: 'test'
  ...
# Subtest: availability [release-gate]
    # Subtest: opens at release time
    not ok 1 - opens at release time
      ---
      duration_ms: 0
      type: 'test'
      failureType: 'cancelledByParent'
      error: 'test did not finish before its parent and was cancelled'
      code: 'ERR_TEST_FAILURE'
      ...
    1..1
not ok 3 - availability [release-gate]
  ---
  duration_ms: 0.453958
  type: 'suite'
  failureType: 'hookFailed'
  error: 'database down'
  code: 'ERR_TEST_FAILURE'
  ...
1..3
# tests 7
# pass 2
# fail 3
`;

const NODE_EXPECTED = [
  ["schedule [schedule-review-v1] > accepts a future time", "pass"],
  ["schedule [schedule-review-v1] > rejects # a past time", "fail"],
  ["schedule [schedule-review-v1] > throws", "error"],
  ["schedule [schedule-review-v1] > skipped one", "skip"],
  ["schedule [schedule-review-v1] > todo one", "skip"],
  ["parent > child ok", "pass"],
  ["availability [release-gate] > opens at release time", "error"],
  ["availability [release-gate]", "error"],
];

/** Hand-written in the shape of `vitest run --reporter=json`. */
const VITEST_JSON = {
  numTotalTests: 6,
  numFailedTests: 2,
  success: false,
  testResults: [
    {
      name: "/repo/src/features/assessment/schedule/schedule.test.ts",
      status: "failed",
      message: "",
      assertionResults: [
        {
          ancestorTitles: ["schedule [schedule-review-v1]"],
          title: "accepts a future time",
          fullName: "schedule [schedule-review-v1] accepts a future time",
          status: "passed",
          duration: 3,
          failureMessages: [],
        },
        {
          ancestorTitles: ["schedule [schedule-review-v1]"],
          title: "rejects a past time",
          fullName: "schedule [schedule-review-v1] rejects a past time",
          status: "failed",
          duration: 4,
          failureMessages: [
            "AssertionError: expected 201 to be 400 // Object.is equality\n    at schedule.test.ts:12:20",
          ],
        },
        {
          ancestorTitles: ["schedule [schedule-review-v1]"],
          title: "reads the class",
          fullName: "schedule [schedule-review-v1] reads the class",
          status: "failed",
          duration: 1,
          failureMessages: [
            "TypeError: Cannot read properties of undefined (reading 'id')\n    at schedule.test.ts:20:9",
          ],
        },
        { ancestorTitles: ["access"], title: "students wait for release", status: "skipped", failureMessages: [] },
        {
          ancestorTitles: ["access"],
          title: "late join",
          fullName: "access late join",
          status: "pending",
          failureMessages: [],
        },
        {
          ancestorTitles: ["access"],
          title: "reminder",
          fullName: "access reminder",
          status: "todo",
          failureMessages: [],
        },
      ],
    },
    {
      name: "/repo/src/features/assessment/schedule/broken.test.ts",
      status: "failed",
      message: "Failed to load url ./missing.ts\nmore detail",
      assertionResults: [],
    },
  ],
};

const OPTIONS: ToRunRecordsOptions = {
  verifications: new Map([
    ["schedule-review-v1", "TEST-ASMT-SCHEDULE"],
    ["release-gate", "TEST-ASMT-GATE"],
    ["nothing-has-this", "TEST-ASMT-NONE"],
  ]),
  commit: COMMIT,
  graphHash: HASH,
  environment: "ci",
  scope: { product: "PRD-LANTERN", release: "pilot-1" },
  tool: { name: "node:test", version: "v24.15.0" },
  startedAt: "2026-10-02T09:00:00Z",
  finishedAt: "2026-10-02T09:01:30.250Z",
  uriBase: "https://ci.example/runs/812",
};

describe("selectorMatches", () => {
  test("matches whole tokens and bracketed tags, not fragments of longer names", () => {
    assert.ok(selectorMatches("schedule-review-v1", "schedule [schedule-review-v1] > accepts"));
    assert.ok(selectorMatches("[schedule-review-v1]", "schedule [schedule-review-v1] > accepts"));
    assert.ok(selectorMatches("schedule-review-v1", "schedule-review-v1"));
    assert.ok(selectorMatches("accepts a future time", "schedule > accepts a future time"));
    assert.ok(!selectorMatches("review-v1", "schedule [schedule-review-v1] > accepts"));
    assert.ok(!selectorMatches("schedule-review-v1", "schedule-review-v10 accepts"));
    assert.ok(!selectorMatches("", "anything"));
  });
});

describe("parseNodeTap", () => {
  test("reads full nested titles and maps each result", () => {
    const parsed = parseNodeTap(NODE_TAP);
    assert.deepEqual(
      parsed.tests.map((t) => [t.fullName, t.result]),
      NODE_EXPECTED,
    );
    assert.equal(parsed.tests[0].durationMs, 0.503667);
    assert.deepEqual(parsed.problems, []);
  });

  test("reads what node --test actually writes", () => {
    const dir = mkdtempSync(join(tmpdir(), "intentset-tap-"));
    try {
      const file = join(dir, "sample.test.mjs");
      writeFileSync(
        file,
        [
          'import { describe, it, test, before } from "node:test";',
          'import assert from "node:assert/strict";',
          'describe("schedule [schedule-review-v1]", () => {',
          '  it("accepts a future time", () => { assert.equal(1, 1); });',
          '  it("rejects # a past time", () => { assert.equal(1, 2); });',
          '  it("throws", () => { throw new TypeError("boom"); });',
          '  it.skip("skipped one", () => {});',
          '  it.todo("todo one");',
          "});",
          'test("parent", async (t) => { await t.test("child ok", () => {}); });',
          'describe("availability [release-gate]", () => {',
          '  before(() => { throw new Error("database down"); });',
          '  it("opens at release time", () => {});',
          "});",
          "",
        ].join("\n"),
      );
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      delete env.NODE_OPTIONS;
      const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", file], { env, encoding: "utf8" });
      assert.match(run.stdout, /^TAP version 13/m, run.stderr);
      const parsed = parseNodeTap(run.stdout);
      assert.deepEqual(parsed.tests.map((t) => [t.fullName, t.result]).sort(), [...NODE_EXPECTED].sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseVitestJson", () => {
  test("maps statuses, tells assertion failures from errors, and reports files that never ran", () => {
    const parsed = parseVitestJson(VITEST_JSON);
    assert.deepEqual(
      parsed.tests.map((t) => [t.fullName, t.result]),
      [
        ["schedule [schedule-review-v1] accepts a future time", "pass"],
        ["schedule [schedule-review-v1] rejects a past time", "fail"],
        ["schedule [schedule-review-v1] reads the class", "error"],
        ["access > students wait for release", "skip"],
        ["access late join", "skip"],
        ["access reminder", "skip"],
      ],
    );
    assert.deepEqual(parsed.problems, [
      "/repo/src/features/assessment/schedule/broken.test.ts failed without running a test: Failed to load url ./missing.ts",
    ]);
  });

  test("refuses output that is not Vitest's", () => {
    assert.throws(() => parseVitestJson({ tests: [] }), /not Vitest JSON reporter output/);
    assert.throws(() => parseVitestJson("[]"), /not Vitest JSON reporter output/);
  });
});

describe("toRunRecords", () => {
  test("one record per verification, worst result, counted rationale, unmatched selectors listed", () => {
    const { records, unmatched } = toRunRecords(parseNodeTap(NODE_TAP), OPTIONS);
    assert.deepEqual(unmatched, ["nothing-has-this"]);
    assert.deepEqual(
      records.map((r) => [r.verificationId, r.result, r.rationale]),
      [
        ["TEST-ASMT-GATE", "error", "2 tests matched release-gate: 2 error."],
        ["TEST-ASMT-SCHEDULE", "fail", "5 tests matched schedule-review-v1: 1 pass, 1 fail, 1 error, 2 skip."],
      ],
    );
    const [gate] = records;
    assert.equal(gate.evidenceId, deriveEvidenceId("TEST-ASMT-GATE", COMMIT, HASH, OPTIONS.finishedAt));
    assert.match(gate.evidenceId, /^EV-[0-9a-f]{16}$/);
    assert.equal(gate.uri, "https://ci.example/runs/812#TEST-ASMT-GATE");
    assert.equal(gate.reviewer, null);
    assert.deepEqual(gate.tool, OPTIONS.tool);
  });

  test("the worst result wins: fail over error over skip over pass", () => {
    const run = (results: ParsedRun["tests"][number]["result"][]): string =>
      toRunRecords(
        { tests: results.map((result, i) => ({ fullName: `t${i} [tag-a]`, result, durationMs: null })), problems: [] },
        { ...OPTIONS, verifications: new Map([["tag-a", "TEST-A"]]) },
      ).records[0].result;
    assert.equal(run(["pass", "pass"]), "pass");
    assert.equal(run(["pass", "skip"]), "skip");
    assert.equal(run(["skip", "error", "pass"]), "error");
    assert.equal(run(["error", "fail", "skip"]), "fail");
  });

  test("two selectors of one verification make one record", () => {
    const { records } = toRunRecords(parseVitestJson(VITEST_JSON), {
      ...OPTIONS,
      tool: { name: "vitest", version: "3.2.4" },
      verifications: new Map([
        ["schedule-review-v1", "TEST-ASMT-SCHEDULE"],
        ["late join", "TEST-ASMT-SCHEDULE"],
      ]),
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].result, "fail");
    assert.equal(
      records[0].rationale,
      "4 tests matched late join, schedule-review-v1: 1 pass, 1 fail, 1 error, 1 skip.",
    );
  });

  test("its records are well formed for the reader and the schema, and the same every time", () => {
    const schema = readJson(join(SPEC_DIR, "evidence.schema.json")) as Schema;
    const first = toRunRecords(parseNodeTap(NODE_TAP), OPTIONS).records;
    assert.deepEqual(readRunRecords(first, "out.json").diagnostics, []);
    assert.deepEqual(validateSchema(schema, first), []);
    assert.deepEqual(toRunRecords(parseNodeTap(NODE_TAP), OPTIONS).records, first);
  });

  test("throws rather than emit a malformed record", () => {
    assert.throws(
      () => toRunRecords(parseNodeTap(NODE_TAP), { ...OPTIONS, finishedAt: "2026-10-02 09:01" }),
      /malformed/,
    );
  });

  test("an adapter's pass at the snapshot classifies as current for an automated verification", () => {
    const { graph, hash } = exampleGraph({
      patch: { "TEST-ASMT-SCHEDULE.md": { frontmatter: { "intentset.verification.method": "automated" } } },
    });
    const parsed: ParsedRun = {
      tests: [{ fullName: "schedule [schedule-review-v1] > accepts", result: "pass", durationMs: 1 }],
      problems: [],
    };
    const { records } = toRunRecords(parsed, {
      ...OPTIONS,
      graphHash: hash,
      verifications: new Map([["schedule-review-v1", "TEST-ASMT-SCHEDULE"]]),
    });
    const result = classifyEvidence(graph, records, { commit: COMMIT, graphHash: hash, scope: OPTIONS.scope });
    assert.equal(result.verifications["TEST-ASMT-SCHEDULE"].status, "current-pass");
  });
});

describe("toRunRecords counting", () => {
  test("a test matched by two selectors of one verification counts once", () => {
    const parsed: ParsedRun = {
      tests: [
        { fullName: "schedule [schedule-review-v1] accepts a future time", result: "pass", durationMs: null },
        { fullName: "schedule [schedule-review-v1] rejects a past time", result: "fail", durationMs: null },
      ],
      problems: [],
    };
    const { records } = toRunRecords(parsed, {
      ...OPTIONS,
      verifications: new Map([
        ["schedule-review-v1", "TEST-ASMT-SCHEDULE"],
        ["accepts a future time", "TEST-ASMT-SCHEDULE"],
      ]),
    });
    assert.equal(records[0].rationale, "2 tests matched accepts a future time, schedule-review-v1: 1 pass, 1 fail.");
  });
});
