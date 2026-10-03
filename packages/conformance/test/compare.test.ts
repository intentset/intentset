import assert from "node:assert/strict";
import { test } from "node:test";
import type { Diagnostic } from "@intentset/core";
import { compareCodes, compareIds, deepEqual, firstMismatch } from "../src/compare.ts";

function diagnostic(code: string, extra: Partial<Diagnostic> = {}): Diagnostic {
  return {
    code,
    severity: "error",
    origin: "graph",
    artifact: "BEH-ASMT-SCHEDULE",
    path: "BEH-ASMT-SCHEDULE.md",
    message: `${code} happened`,
    remediation: "fix it",
    ...extra,
  };
}

test("diagnostic codes compare as a multiset, in any order", () => {
  assert.equal(compareCodes(["CORE003", "CORE001"], [diagnostic("CORE001"), diagnostic("CORE003")]), null);
  assert.equal(compareCodes(["CORE003", "CORE003"], [diagnostic("CORE003"), diagnostic("CORE003")]), null);
  assert.equal(compareCodes([], []), null);
});

test("the first difference names the code, the counts, and every actual diagnostic", () => {
  const detail = compareCodes(
    ["CORE003", "CORE003"],
    [diagnostic("CORE003", { location: { line: 17 }, field: "/intentset/links/governedBy/0" }), diagnostic("CORE009")],
  );
  assert.ok(detail);
  assert.match(detail, /^missing CORE003 \(expected 2, got 1\); expected \[CORE003, CORE003\], got:/);
  assert.match(
    detail,
    /CORE003 error graph BEH-ASMT-SCHEDULE\.md:17 BEH-ASMT-SCHEDULE \/intentset\/links\/governedBy\/0: CORE003 happened/,
  );
  assert.match(detail, /CORE009 error graph BEH-ASMT-SCHEDULE\.md BEH-ASMT-SCHEDULE: CORE009 happened/);

  assert.match(
    compareCodes([], [diagnostic("CORE001")]) ?? "",
    /^unexpected CORE001 \(expected 0, got 1\); expected \[\], got:/,
  );
  assert.equal(compareCodes(["CORE001"], []), "missing CORE001 (expected 1, got 0); expected [CORE001], got none");
});

test("ID lists compare sorted and say what is missing or extra", () => {
  assert.equal(compareIds(["B", "A"], ["A", "B"]), null);
  assert.equal(compareIds(["A", "B"], ["B", "C"]), "missing [A], unexpected [C]; got [B, C]");
  assert.equal(compareIds(["A"], ["A", "A"]), "a duplicate ID; got [A, A]");
});

test("a deep partial match ignores keys the expectation does not name", () => {
  const actual = {
    contract: "intentset/export/0.1",
    generatedAt: "2026-01-01T00:00:00Z",
    graphHash: "abc",
    artifacts: [
      { id: "A", type: "rule", links: {} },
      { id: "B", type: "behavior", links: { governedBy: ["A"] } },
    ],
  };
  assert.equal(firstMismatch({ contract: "intentset/export/0.1" }, actual), null);
  assert.equal(firstMismatch({ artifacts: [{ id: "A" }, { id: "B", links: { governedBy: ["A"] } }] }, actual), null);
  assert.equal(firstMismatch({ artifacts: [{ id: "A" }] }, actual), "/artifacts: expected 1 item(s), got 2");
  assert.equal(
    firstMismatch({ artifacts: [{ id: "A" }, { id: "C" }] }, actual),
    '/artifacts/1/id: expected "C", got "B"',
  );
  assert.equal(firstMismatch({ graphHash: "def" }, actual), '/graphHash: expected "def", got "abc"');
  assert.equal(firstMismatch({ release: null }, actual), "/release: expected null, got <absent>");
  assert.match(
    firstMismatch({ artifacts: {} }, actual) ?? "",
    /^\/artifacts: expected an object, got \[\{"id":"A".*\.\.\.$/,
  );
  assert.equal(firstMismatch({ "a/b": 1 }, { "a/b": 2 }), "/a~1b: expected 1, got 2");
});

test("deepEqual is the partial match in both directions", () => {
  assert.ok(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }));
  assert.ok(!deepEqual({ a: 1 }, { a: 1, b: 2 }));
  assert.ok(!deepEqual({ a: 1, b: 2 }, { a: 1 }));
});
