import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkEvidence, classifyEvidence, coverage, type EvidenceSnapshot } from "../src/index.ts";
import { automatedRun, COMMIT, codes, exampleGraph, OLD_HASH, review } from "./helpers.ts";

const SCOPE = { product: "PRD-LANTERN", release: "pilot-1" };
const approved = exampleGraph({ approve: true });
const draft = exampleGraph();
const at = (hash: string): EvidenceSnapshot => ({ commit: COMMIT, graphHash: hash, scope: SCOPE });

describe("BEH-EVIDENCE-CURRENT: coverage", () => {
  test("counts links and current passes apart, with snapshot and denominator", () => {
    const report = coverage(draft.graph, classifyEvidence(draft.graph, [], at(draft.hash)), { level: "L3" });
    assert.deepEqual(report.snapshot, { commit: COMMIT, graphHash: draft.hash, scope: SCOPE });
    assert.deepEqual(report.denominator, { behaviors: 1, rules: 2, scenarios: 1 });
    assert.deepEqual(report.linked, { behaviors: 1, rules: 2, scenarios: 1 });
    assert.deepEqual(report.verified, { behaviors: 0, rules: 0, scenarios: 0 });
    assert.deepEqual(report.manual.linked, { behaviors: 1, rules: 2, scenarios: 1 });
    assert.deepEqual(report.automated.linked, { behaviors: 0, rules: 0, scenarios: 0 });
    assert.match(report.measures.linked, /^links/);
    assert.match(report.measures.verified, /^evidence/);
    assert.deepEqual(
      report.perClaim.map((c) => [c.id, c.required, c.linked, c.verified]),
      [
        ["BEH-ASMT-SCHEDULE", false, true, false],
        ["RULE-ASMT-AUTH", false, true, false],
        ["RULE-ASMT-FUTURE", false, true, false],
        ["SCN-ASMT-SCHEDULE", false, true, false],
      ],
    );
  });

  test("never reduces a count to a percentage: every count is a whole number of claims", () => {
    const report = coverage(
      approved.graph,
      classifyEvidence(approved.graph, [review(approved.hash)], at(approved.hash)),
    );
    const counts = [
      report.denominator,
      report.linked,
      report.verified,
      report.manual.linked,
      report.automated.verified,
    ];
    for (const count of counts) {
      for (const value of Object.values(count)) assert.ok(Number.isInteger(value));
    }
    assert.ok(!JSON.stringify(report).includes("percent"));
  });

  test("a retired verification is not applicable and a retired claim leaves the denominator", () => {
    const retired = exampleGraph({
      patch: {
        "TEST-ASMT-SCHEDULE.md": { frontmatter: { "intentset.status": "retired" } },
        "SCN-ASMT-SCHEDULE.md": { frontmatter: { "intentset.status": "retired" } },
      },
    });
    const report = coverage(retired.graph, classifyEvidence(retired.graph, [review(retired.hash)], at(retired.hash)));
    assert.deepEqual(report.denominator, { behaviors: 1, rules: 2, scenarios: 0 });
    assert.deepEqual(report.excluded.retired, { behaviors: 0, rules: 0, scenarios: 1 });
    assert.deepEqual(report.linked, { behaviors: 0, rules: 0, scenarios: 0 });
  });

  test("names what it could not check", () => {
    const report = coverage(
      draft.graph,
      classifyEvidence(draft.graph, [review("@current")], { commit: COMMIT, graphHash: draft.hash }),
    );
    assert.deepEqual(
      report.unresolved.map((u) => u.subject),
      ["TEST-ASMT-SCHEDULE", "scope"],
    );
  });
});

describe("checkEvidence", () => {
  test("CORE007 binds non-draft claims at L3 and above only", () => {
    const none = (level: "L1" | "L2" | "L3" | "L4") =>
      codes(checkEvidence(approved.graph, [], at(approved.hash), { level }).diagnostics);
    assert.deepEqual(none("L1"), []);
    assert.deepEqual(none("L2"), []);
    assert.deepEqual(none("L3"), ["CORE007", "CORE007", "CORE007", "CORE007"]);
    assert.deepEqual(none("L4"), ["CORE007", "CORE007", "CORE007", "CORE007"]);
    assert.deepEqual(codes(checkEvidence(draft.graph, [], at(draft.hash), { level: "L3" }).diagnostics), []);
  });

  test("a current pass of the linked review clears CORE007", () => {
    const result = checkEvidence(approved.graph, [review(approved.hash)], at(approved.hash), { level: "L3" });
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.coverage.verified, { behaviors: 1, rules: 2, scenarios: 1 });
    assert.deepEqual(result.coverage.manual.verified, { behaviors: 1, rules: 2, scenarios: 1 });
  });

  test("CORE007 says which way the evidence falls short", () => {
    const cases: [Parameters<typeof review>[1] | null, RegExp][] = [
      [{ result: "fail" }, /failed at this snapshot/],
      [{ result: "skip" }, /was skipped/],
      [{ result: "error" }, /errored/],
      [{ graphHash: OLD_HASH }, /is stale/],
      [null, /has no run record/],
    ];
    for (const [overrides, pattern] of cases) {
      const records = overrides === null ? [] : [review(approved.hash, overrides)];
      const [first] = checkEvidence(approved.graph, records, at(approved.hash), { level: "L3" }).diagnostics;
      assert.equal(first.code, "CORE007");
      assert.equal(first.origin, "evidence");
      assert.equal(first.artifact, "BEH-ASMT-SCHEDULE");
      assert.equal(first.path, "BEH-ASMT-SCHEDULE.md");
      assert.match(first.message, pattern);
      assert.match(first.message, /^Approved behavior BEH-ASMT-SCHEDULE is not verified in this snapshot: .*\.$/);
      assert.match(first.remediation, /TEST-ASMT-SCHEDULE/);
    }
  });

  test("CORE007 for a claim with no verification definition says that", () => {
    const unlinked = exampleGraph({
      approve: true,
      patch: { "TEST-ASMT-SCHEDULE.md": { frontmatter: { "intentset.links.verifies": ["BEH-ASMT-SCHEDULE"] } } },
    });
    const result = checkEvidence(unlinked.graph, [review(unlinked.hash)], at(unlinked.hash), { level: "L3" });
    assert.deepEqual(
      result.diagnostics.map((d) => d.artifact),
      ["RULE-ASMT-AUTH", "RULE-ASMT-FUTURE", "SCN-ASMT-SCHEDULE"],
    );
    for (const d of result.diagnostics) assert.match(d.message, /has no verification definition/);
  });

  test("EVID003 when a locator names no file, and unresolved when there is no tree", () => {
    const files = new Set(["src/index.ts"]);
    const checked = checkEvidence(draft.graph, [], at(draft.hash), { files });
    assert.deepEqual(codes(checked.diagnostics), ["EVID003"]);
    assert.equal(checked.diagnostics[0].field, "/intentset/verification/locator");
    assert.equal(checked.diagnostics[0].severity, "warning");
    assert.ok(!checked.coverage.unresolved.some((u) => u.reason.includes("locator")));

    const present = checkEvidence(draft.graph, [], at(draft.hash), {
      files: new Set(["examples/scheduling/TEST-ASMT-SCHEDULE.md"]),
    });
    assert.deepEqual(present.diagnostics, []);

    const unchecked = checkEvidence(draft.graph, [], at(draft.hash));
    assert.deepEqual(unchecked.diagnostics, []);
    assert.ok(
      unchecked.coverage.unresolved.some((u) => u.subject === "TEST-ASMT-SCHEDULE" && u.reason.includes("locator")),
    );
  });

  test("diagnostics come back sorted, all with origin evidence", () => {
    const records = [review(approved.hash, { verificationId: "TEST-ASMT-GONE" }), automatedRun(approved.hash)];
    const { diagnostics } = checkEvidence(approved.graph, records, at(approved.hash), {
      level: "L3",
      files: new Set(),
      evidencePath: "evidence.json",
    });
    assert.deepEqual(
      diagnostics.map((d) => `${d.path} ${d.code}`),
      [
        "BEH-ASMT-SCHEDULE.md CORE007",
        "RULE-ASMT-AUTH.md CORE007",
        "RULE-ASMT-FUTURE.md CORE007",
        "SCN-ASMT-SCHEDULE.md CORE007",
        "TEST-ASMT-SCHEDULE.md EVID003",
        "evidence.json EVID002",
        "evidence.json EVID001",
      ],
      "core's order: path, then artifact (EVID002 names none), then code",
    );
    assert.ok(diagnostics.every((d) => d.origin === "evidence"));
  });
});
