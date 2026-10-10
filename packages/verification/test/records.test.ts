import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { type Schema, validateSchema } from "../../conformance/src/harness.ts";
import { compareRecords, isUtcTimestamp, readRunRecords, type RunRecord, timeKey } from "../src/index.ts";
import { automatedRun, readJson, review, SPEC_DIR } from "./helpers.ts";

const HASH = "a".repeat(64);
const schema = readJson(join(SPEC_DIR, "evidence.schema.json")) as Schema;

function without(record: RunRecord, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  delete copy[key];
  return copy;
}

/** Records the schema and the reader must judge alike, valid or not. */
function variants(): [string, unknown][] {
  const manual = review(HASH);
  const automated = automatedRun(HASH);
  const list: [string, unknown][] = [
    ["manual review", manual],
    ["automated run", automated],
    ["automated run with a rationale", { ...automated, rationale: "Three tests matched." }],
    ["manual review assisted by a tool", { ...manual, tool: { name: "checklist", version: "2" } }],
    ["@current placeholders", { ...manual, commit: "@current", graphHash: "@current" }],
    ["nine-digit fraction", { ...manual, finishedAt: "2026-09-30T09:45:00.123456789Z" }],
    ["urn uri", { ...manual, uri: "urn:review:42" }],
    ["namespaced extension", { ...manual, extensions: { "org.example/build": 42 } }],
    ["not an object", "EV-1"],
    ["null entry", null],
    ["unknown key", { ...manual, method: "manual" }],
    ["un-namespaced extension", { ...manual, extensions: { build: 42 } }],
    ["extensions not a mapping", { ...manual, extensions: [] }],
    ["empty evidence ID", { ...manual, evidenceId: "" }],
    ["evidence ID with a space", { ...manual, evidenceId: "EV 1" }],
    ["lowercase verification ID", { ...manual, verificationId: "test-asmt" }],
    ["empty commit", { ...manual, commit: "" }],
    ["uppercase graph hash", { ...manual, graphHash: "A".repeat(64) }],
    ["short graph hash", { ...manual, graphHash: "abc" }],
    ["blank environment", { ...manual, environment: "  " }],
    ["scope without release", { ...manual, scope: { product: "PRD-LANTERN" } }],
    ["scope with an extra key", { ...manual, scope: { product: "PRD-LANTERN", release: "pilot-1", role: "teacher" } }],
    ["scope with a lowercase product", { ...manual, scope: { product: "lantern", release: "pilot-1" } }],
    ["scope as a string", { ...manual, scope: "pilot-1" }],
    ["tool without version", { ...automated, tool: { name: "node:test" } }],
    ["tool with an extra key", { ...automated, tool: { name: "node:test", version: "v24", os: "linux" } }],
    ["tool as a string", { ...automated, tool: "node:test" }],
    ["empty reviewer", { ...manual, reviewer: "" }],
    ["manual review without rationale", without(manual, "rationale")],
    ["blank rationale", { ...manual, rationale: " " }],
    ["neither tool nor reviewer", { ...automated, tool: null }],
    ["local offset", { ...manual, startedAt: "2026-09-30T11:00:00+02:00" }],
    ["no seconds", { ...manual, startedAt: "2026-09-30T09:00Z" }],
    ["ten-digit fraction", { ...manual, finishedAt: "2026-09-30T09:45:00.1234567890Z" }],
    ["month 13", { ...manual, startedAt: "2026-13-01T09:00:00Z" }],
    ["hour 24", { ...manual, startedAt: "2026-09-30T24:00:00Z" }],
    ["timestamp as a number", { ...manual, startedAt: 1_759_222_800_000 }],
    ["result passed", { ...manual, result: "passed" }],
    ["uri without a scheme", { ...manual, uri: "runs/42" }],
  ];
  for (const key of Object.keys(manual).filter((k) => k !== "rationale")) {
    list.push([`missing ${key}`, without(manual, key)]);
  }
  return list;
}

describe("readRunRecords", () => {
  test("reads a manual and an automated record unchanged", () => {
    const records = [review(HASH), automatedRun(HASH)];
    const read = readRunRecords(JSON.parse(JSON.stringify(records)), "evidence.json");
    assert.deepEqual(read.diagnostics, []);
    assert.deepEqual(read.records, records);
  });

  test("agrees with spec/evidence.schema.json on every variant", () => {
    for (const [name, entry] of variants()) {
      const reader = readRunRecords([entry], "evidence.json").diagnostics.length === 0;
      const errors = validateSchema(schema, [entry]);
      assert.equal(
        errors.length === 0,
        reader,
        `${name}: reader ${reader ? "accepts" : "rejects"}, schema says ${JSON.stringify(errors)}`,
      );
    }
  });

  test("checks three things the schema cannot, and the schema says so", () => {
    const manual = review(HASH);
    const beyond: [string, unknown[]][] = [
      ["30 February", [{ ...manual, startedAt: "2026-02-30T09:00:00Z" }]],
      ["finished before it started", [{ ...manual, startedAt: "2026-09-30T10:00:00Z" }]],
      ["repeated evidence ID", [manual, { ...manual }]],
    ];
    for (const [name, entries] of beyond) {
      assert.deepEqual(validateSchema(schema, entries), [], name);
      assert.equal(readRunRecords(entries, "evidence.json").diagnostics.length, 1, name);
    }
    const description = (schema as { description: string }).description;
    for (const words of ["calendar day", "finishedAt is not before startedAt", "evidenceId"]) {
      assert.ok(description.includes(words), words);
    }
  });

  test("reports each problem as one EVID001 error, pointing into the input, and drops the record", () => {
    const bad = { ...review(HASH), result: "passed", startedAt: "yesterday" };
    const read = readRunRecords([review(HASH), bad], "runs/evidence.json");
    assert.equal(read.records.length, 1);
    assert.deepEqual(
      read.diagnostics.map((d) => [d.code, d.severity, d.origin, d.artifact, d.path, d.field]),
      [
        ["EVID001", "error", "evidence", "TEST-ASMT-SCHEDULE", "runs/evidence.json", "/1/result"],
        ["EVID001", "error", "evidence", "TEST-ASMT-SCHEDULE", "runs/evidence.json", "/1/startedAt"],
      ],
    );
    for (const d of read.diagnostics) {
      assert.match(d.message, /^[A-Z`].*\.$/);
      assert.match(d.remediation, /\.$/);
    }
  });

  test("keeps the first of two records with one evidence ID", () => {
    const first = review(HASH, { evidenceId: "EV-SAME", result: "fail" });
    const second = review(HASH, { evidenceId: "EV-SAME", result: "pass" });
    const read = readRunRecords([first, second], "evidence.json");
    assert.deepEqual(read.records, [first]);
    assert.equal(read.diagnostics[0].field, "/1/evidenceId");
  });

  test("a non-array is one EVID001 at the root", () => {
    const read = readRunRecords({ records: [] }, "evidence.json");
    assert.deepEqual(read.records, []);
    assert.deepEqual(
      read.diagnostics.map((d) => [d.code, d.artifact, d.field]),
      [["EVID001", null, ""]],
    );
  });

  test("an unreadable verification ID leaves the diagnostic's artifact null", () => {
    const read = readRunRecords([{ ...review(HASH), verificationId: 7 }], "evidence.json");
    assert.equal(read.diagnostics[0].artifact, null);
  });
});

describe("timestamps", () => {
  test("isUtcTimestamp accepts real UTC instants only", () => {
    assert.ok(isUtcTimestamp("2028-02-29T23:59:59Z"));
    assert.ok(isUtcTimestamp("2026-10-02T09:30:00.5Z"));
    assert.ok(!isUtcTimestamp("2026-02-29T00:00:00Z"));
    assert.ok(!isUtcTimestamp("2026-04-31T00:00:00Z"));
    assert.ok(!isUtcTimestamp("2026-10-02T09:30:60Z"));
    assert.ok(!isUtcTimestamp("2026-10-02 09:30:00Z"));
    assert.ok(!isUtcTimestamp("2026-10-02T09:30:00z"));
  });

  test("order is exact across fractions, then by evidence ID", () => {
    assert.ok(timeKey("2026-10-02T10:00:00Z") < timeKey("2026-10-02T10:00:00.5Z"));
    assert.ok(timeKey("2026-10-02T10:00:00.5Z") < timeKey("2026-10-02T10:00:00.51Z"));
    const a = review(HASH, { evidenceId: "EV-A", finishedAt: "2026-10-02T10:00:00.5Z" });
    const b = review(HASH, { evidenceId: "EV-B", finishedAt: "2026-10-02T10:00:00Z" });
    const c = review(HASH, { evidenceId: "EV-C", finishedAt: "2026-10-02T10:00:00Z" });
    assert.deepEqual(
      [a, c, b].sort(compareRecords).map((r) => r.evidenceId),
      ["EV-B", "EV-C", "EV-A"],
    );
  });
});
