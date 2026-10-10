import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bindPlaceholders, CURRENT, classifyEvidence, type EvidenceSnapshot } from "../src/index.ts";
import { automatedRun, COMMIT, codes, exampleGraph, OLD_COMMIT, OLD_HASH, review } from "./helpers.ts";

const { graph, hash } = exampleGraph();
const SCOPE = { product: "PRD-LANTERN", release: "pilot-1" };
const snapshot: EvidenceSnapshot = { commit: COMMIT, graphHash: hash, scope: SCOPE };

function statusOf(records: Parameters<typeof classifyEvidence>[1], at: EvidenceSnapshot = snapshot) {
  return classifyEvidence(graph, records, at).verifications["TEST-ASMT-SCHEDULE"];
}

describe("BEH-EVIDENCE-CURRENT: classifyEvidence", () => {
  test("only a pass at both the commit and the graph hash is current", () => {
    assert.equal(statusOf([review(hash)]).status, "current-pass");
    assert.equal(statusOf([review(hash, { commit: OLD_COMMIT })]).status, "stale");
    assert.equal(statusOf([review(OLD_HASH)]).status, "stale");
    assert.equal(statusOf([review(hash, { result: "skip" })]).status, "skip");
    assert.equal(statusOf([review(hash, { result: "error" })]).status, "error");
    assert.equal(statusOf([review(hash, { result: "fail" })]).status, "current-fail");
    assert.equal(statusOf([]).status, "missing");
  });

  test("a stale failure is stale, not a current failure", () => {
    assert.equal(statusOf([review(OLD_HASH, { result: "fail" })]).status, "stale");
  });

  test("an unknown commit matches on the graph hash alone and says so", () => {
    const unknown = { ...snapshot, commit: null };
    const evidence = statusOf([review(hash, { commit: OLD_COMMIT })], unknown);
    assert.equal(evidence.status, "current-pass");
    assert.equal(evidence.note, "commit unknown; matched on graph hash");
    assert.equal(statusOf([review(OLD_HASH)], unknown).status, "stale");
  });

  test("a failure at the snapshot stays visible after an older pass", () => {
    const pass = review(hash, { finishedAt: "2026-09-30T09:45:00Z" });
    const fail = review(hash, {
      startedAt: "2026-10-01T10:00:00Z",
      finishedAt: "2026-10-01T10:30:00Z",
      result: "fail",
    });
    const evidence = statusOf([fail, pass]);
    assert.equal(evidence.status, "current-fail");
    assert.equal(evidence.latest, fail);
    assert.deepEqual(evidence.history, [pass, fail]);
    assert.deepEqual(evidence.atSnapshot, { pass: 1, fail: 1, skip: 0, error: 0 });
  });

  test("a newer run at another snapshot does not decide the status at this one", () => {
    const here = review(hash, { result: "fail" });
    const later = review(OLD_HASH, { finishedAt: "2026-10-05T10:00:00Z" });
    const evidence = statusOf([here, later]);
    assert.equal(evidence.status, "current-fail");
    assert.equal(evidence.latest, here);
    assert.equal(evidence.history.length, 2);
  });

  test("a record still carrying @current is unresolved, never current", () => {
    const unbound = review(CURRENT);
    const evidence = statusOf([unbound]);
    assert.equal(evidence.status, "unresolved");
    assert.match(evidence.note ?? "", /unbound @current placeholder/);
    assert.equal(statusOf([review(hash, { commit: CURRENT })]).status, "unresolved");
    assert.equal(statusOf([review(hash, { commit: CURRENT })], { ...snapshot, commit: null }).status, "current-pass");
  });

  test("records for another product or release are ignored and counted", () => {
    const other = review(hash, { scope: { product: "PRD-LANTERN", release: "pilot-2" } });
    const result = classifyEvidence(graph, [other], snapshot);
    assert.equal(result.ignoredOutOfScope, 1);
    const evidence = result.verifications["TEST-ASMT-SCHEDULE"];
    assert.equal(evidence.status, "missing");
    assert.equal(evidence.outOfScope, 1);
    assert.match(evidence.note ?? "", /1 record for another product or release ignored/);
    assert.equal(
      classifyEvidence(graph, [other], { ...snapshot, scope: null }).verifications["TEST-ASMT-SCHEDULE"].status,
      "current-pass",
    );
    assert.equal(classifyEvidence(graph, [other], { commit: COMMIT, graphHash: hash }).snapshot.scope, null);
  });

  test("a record naming anything but a verification is EVID002 and evidence for nothing", () => {
    const result = classifyEvidence(
      graph,
      [review(hash, { verificationId: "TEST-ASMT-GONE" }), review(hash, { verificationId: "RULE-ASMT-AUTH" })],
      snapshot,
      { evidencePath: "evidence/runs.json" },
    );
    assert.deepEqual(codes(result.diagnostics), ["EVID002", "EVID002"]);
    assert.ok(result.diagnostics.every((d) => d.severity === "warning" && d.path === "evidence/runs.json"));
    assert.equal(result.unknown.length, 2);
    assert.equal(result.verifications["TEST-ASMT-SCHEDULE"].status, "missing");
  });

  test("a run of a manual review without a reviewer is EVID001 and does not count", () => {
    const result = classifyEvidence(graph, [automatedRun(hash)], snapshot);
    assert.deepEqual(codes(result.diagnostics), ["EVID001"]);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.verifications["TEST-ASMT-SCHEDULE"].status, "missing");
  });

  test("an automated verification accepts a tool's record", () => {
    const automated = exampleGraph({
      patch: { "TEST-ASMT-SCHEDULE.md": { frontmatter: { "intentset.verification.method": "automated" } } },
    });
    const result = classifyEvidence(automated.graph, [automatedRun(automated.hash)], {
      ...snapshot,
      graphHash: automated.hash,
    });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.verifications["TEST-ASMT-SCHEDULE"].status, "current-pass");
    assert.equal(result.verifications["TEST-ASMT-SCHEDULE"].method, "automated");
  });

  test("is deterministic whatever order the records arrive in", () => {
    const records = [
      review(hash, { evidenceId: "EV-3", finishedAt: "2026-10-01T10:00:00Z", result: "fail" }),
      review(hash, { evidenceId: "EV-1" }),
      review(OLD_HASH, { evidenceId: "EV-2" }),
      review(hash, { evidenceId: "EV-4", verificationId: "TEST-ASMT-NONE" }),
      review(hash, { evidenceId: "EV-5", scope: { product: "PRD-OTHER", release: "pilot-1" } }),
    ];
    const forward = JSON.stringify(classifyEvidence(graph, records, snapshot));
    const backward = JSON.stringify(classifyEvidence(graph, [...records].reverse(), snapshot));
    assert.equal(forward, backward);
  });

  test("lists every verification in the graph, by ID", () => {
    assert.deepEqual(Object.keys(classifyEvidence(graph, [], snapshot).verifications), ["TEST-ASMT-SCHEDULE"]);
  });
});

describe("bindPlaceholders", () => {
  test("replaces @current with the snapshot's values and leaves everything else alone", () => {
    const raw = [
      { commit: "@current", graphHash: "@current", evidenceId: "EV-1" },
      { commit: OLD_COMMIT, graphHash: "@current" },
      "not a record",
    ];
    const bound = bindPlaceholders(raw, { commit: COMMIT, graphHash: hash });
    assert.deepEqual(bound, [
      { commit: COMMIT, graphHash: hash, evidenceId: "EV-1" },
      { commit: OLD_COMMIT, graphHash: hash },
      "not a record",
    ]);
    assert.equal(raw[0] instanceof Object && (raw[0] as { commit: string }).commit, "@current");
  });

  test("leaves a @current commit in place when the snapshot's commit is unknown", () => {
    assert.deepEqual(
      bindPlaceholders([{ commit: "@current", graphHash: "@current" }], { commit: null, graphHash: hash }),
      [{ commit: "@current", graphHash: hash }],
    );
  });
});
