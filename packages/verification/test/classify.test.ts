import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bindPlaceholders,
  CURRENT,
  classifyEvidence,
  type EvidenceSnapshot,
  type RunRecord,
  type Subject,
} from "../src/index.ts";
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

const SUBJECT_HASH = "5".repeat(64);
const MOVED_HASH = "6".repeat(64);
const subject: Subject = {
  hash: SUBJECT_HASH,
  parts: [
    { kind: "slice-file", id: "src/a.ts", hash: "h1", owner: "SLICE-A", path: "src/a.ts" },
    { kind: "test", id: "tests/a.test.ts", hash: "h2", path: "tests/a.test.ts" },
  ],
  unexercised: [{ id: "RES-A", files: ["backend/a.ts", "backend/b.ts"] }],
};
const bound = (overrides: Partial<RunRecord> = {}) =>
  review(OLD_HASH, { commit: OLD_COMMIT, binding: "subject", subjectHash: SUBJECT_HASH, ...overrides });
const under = (binding: "subject" | "commit", more: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
  ...snapshot,
  binding,
  subjects: new Map([["TEST-ASMT-SCHEDULE", subject]]),
  ...more,
});

describe("BEH-EVIDENCE-CURRENT: subject binding", () => {
  test("a subject record is current while its subject is unchanged, whatever the commit and graph hash", () => {
    const evidence = statusOf([bound()], under("subject"));
    assert.equal(evidence.status, "current-pass");
    assert.equal(evidence.binding, "subject");
    assert.match(evidence.note ?? "", /^judged by subject binding; the run was at commit 000000000$/);
    assert.deepEqual(evidence.atSnapshot, { pass: 1, fail: 0, skip: 0, error: 0 });
  });

  test("the result of a current subject record decides the status as it does under commit binding", () => {
    assert.equal(statusOf([bound({ result: "fail" })], under("subject")).status, "current-fail");
    assert.equal(statusOf([bound({ result: "skip" })], under("subject")).status, "skip");
    const pass = bound({ finishedAt: "2026-09-30T09:45:00Z" });
    const fail = bound({ finishedAt: "2026-10-01T09:45:00Z", result: "fail" });
    assert.equal(statusOf([pass, fail], under("subject")).status, "current-fail");
  });

  test("a subject record whose hash differs is stale, and says what moved among the files git lists", () => {
    const moved = bound({ subjectHash: MOVED_HASH });
    const asked: string[] = [];
    const at = under("subject", {
      changedSince: (commit) => {
        asked.push(commit);
        return ["src/a.ts", "docs/unrelated.md"];
      },
    });
    const evidence = statusOf([moved], at);
    assert.equal(evidence.status, "stale");
    assert.equal(evidence.note, "the subject changed since the run at commit 000000000: slice-file src/a.ts (SLICE-A)");
    assert.deepEqual(asked, [OLD_COMMIT]);
  });

  test("a stale subject record says so plainly when git cannot name what moved", () => {
    const moved = bound({ subjectHash: MOVED_HASH });
    assert.equal(statusOf([moved], under("subject")).note, "the subject changed since the run");
    assert.match(
      statusOf([moved], under("subject", { changedSince: () => null })).note ?? "",
      /which part moved is unknown, because commit 000000000 is not an ancestor/,
    );
    assert.match(
      statusOf([moved], under("subject", { changedSince: () => ["unrelated.txt"] })).note ?? "",
      /in a part no changed file names/,
    );
  });

  test("a commit-binding record is stale under subject binding, with a note, even at the snapshot", () => {
    const evidence = statusOf([review(hash)], under("subject"));
    assert.equal(evidence.status, "stale");
    assert.match(evidence.note ?? "", /bound to commit abcdef012, not to a subject/);
    assert.match(evidence.note ?? "", /re-imported/);
  });

  test("a subject record is stale under commit binding, with a note, even at the snapshot", () => {
    const evidence = statusOf([bound({ commit: COMMIT, graphHash: hash })], under("commit"));
    assert.equal(evidence.status, "stale");
    assert.equal(evidence.binding, "commit");
    assert.match(evidence.note ?? "", /bound to a subject, not to a commit/);
    assert.equal(statusOf([review(hash)], under("commit")).status, "current-pass");
  });

  test("a snapshot that names no binding is judged by commit, as before", () => {
    assert.equal(statusOf([review(hash)]).binding, "commit");
    assert.equal(classifyEvidence(graph, [], snapshot).snapshot.binding, "commit");
    assert.equal(statusOf([bound()]).status, "stale");
  });

  test("subject binding with no subject for the verification is unresolved, never current", () => {
    const evidence = statusOf([bound()], { ...snapshot, binding: "subject", subjects: new Map() });
    assert.equal(evidence.status, "unresolved");
    assert.match(evidence.note ?? "", /no subject could be computed/);
    assert.equal(statusOf([], { ...snapshot, binding: "subject" }).status, "missing");
  });

  test("a placeholder still unbound is unresolved under either binding", () => {
    assert.equal(statusOf([bound({ commit: CURRENT })], under("subject")).status, "unresolved");
  });

  test("EVID004 says a repository with no slice claims was judged by commit", () => {
    const none = classifyEvidence(graph, [review(hash)], {
      ...snapshot,
      binding: "commit",
      bindingReason: "no-slices",
    });
    assert.deepEqual(codes(none.diagnostics), ["EVID004"]);
    assert.equal(none.diagnostics[0].severity, "warning");
    assert.equal(none.diagnostics[0].origin, "evidence");
    assert.equal(none.verifications["TEST-ASMT-SCHEDULE"].status, "current-pass");
    for (const reason of ["configured", "default"] as const) {
      const quiet = classifyEvidence(graph, [review(hash)], { ...snapshot, binding: "commit", bindingReason: reason });
      assert.deepEqual(quiet.diagnostics, []);
    }
  });

  test("EVID005 lists the files changed since a current record that nothing claims, once, up to twenty", () => {
    const many = Array.from({ length: 23 }, (_, i) => `misc/file-${String(i).padStart(2, "0")}.txt`);
    const at = under("subject", {
      changedSince: () => ["src/a.ts", ...many],
      covers: (path) => path === "src/a.ts",
    });
    const result = classifyEvidence(graph, [bound()], at);
    const found = result.diagnostics.filter((d) => d.code === "EVID005");
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, "warning");
    assert.match(found[0].message, /^23 files changed since the commit of a subject-bound record/);
    assert.match(found[0].message, /misc\/file-00\.txt/);
    assert.match(found[0].message, /misc\/file-19\.txt, and 3 more\.$/);
    assert.doesNotMatch(found[0].message, /file-20|src\/a\.ts/);
    assert.equal(result.verifications["TEST-ASMT-SCHEDULE"].status, "current-pass", "a warning, not a failure");
  });

  test("EVID005 is silent when every changed file can move a subject, and says so in a note when git cannot say", () => {
    const covered = under("subject", { changedSince: () => ["src/a.ts"], covers: () => true });
    assert.deepEqual(classifyEvidence(graph, [bound()], covered).diagnostics, []);
    const unknown = under("subject", { changedSince: () => null, covers: () => false });
    const result = classifyEvidence(graph, [bound()], unknown);
    assert.deepEqual(result.diagnostics, []);
    assert.match(
      result.verifications["TEST-ASMT-SCHEDULE"].note ?? "",
      /files changed since then could not be listed, because the commit is not an ancestor/,
    );
  });

  test("EVID005 is not reported under commit binding", () => {
    const at = under("commit", { changedSince: () => ["misc/x.txt"], covers: () => false });
    assert.deepEqual(classifyEvidence(graph, [review(hash)], at).diagnostics, []);
  });
});

describe("BEH-EVIDENCE-CURRENT: what the binding could not see (EVID006)", () => {
  test("EVID006 names a used resource the verification does not exercise when a file of it changed, and the record stays current", () => {
    const at = under("subject", { changedSince: () => ["backend/a.ts", "docs/x.md"], covers: () => true });
    const result = classifyEvidence(graph, [bound()], at);
    const found = result.diagnostics.filter((d) => d.code === "EVID006");
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, "warning");
    assert.equal(found[0].origin, "evidence");
    assert.match(
      found[0].message,
      /^1 verification is current though a resource it uses and does not exercise changed since the commit of its record: RES-A \(backend\/a\.ts\); TEST-ASMT-SCHEDULE\.$/,
    );
    assert.doesNotMatch(found[0].message, /backend\/b\.ts|docs\/x\.md/);
    assert.equal(result.verifications["TEST-ASMT-SCHEDULE"].status, "current-pass", "a warning, not a failure");
  });

  test("EVID006 is silent when no file of the unexercised resource changed, when git cannot say, and for a stale record", () => {
    const quiet = under("subject", { changedSince: () => ["docs/x.md"], covers: () => true });
    assert.deepEqual(classifyEvidence(graph, [bound()], quiet).diagnostics, []);
    const unknown = under("subject", { changedSince: () => null, covers: () => true });
    assert.deepEqual(classifyEvidence(graph, [bound()], unknown).diagnostics, []);
    const stale = under("subject", { changedSince: () => ["backend/a.ts"], covers: () => true });
    assert.deepEqual(classifyEvidence(graph, [bound({ subjectHash: MOVED_HASH })], stale).diagnostics, []);
  });

  test("EVID006 is silent when the subject leaves nothing out, and under commit binding", () => {
    const none = under("subject", {
      subjects: new Map([["TEST-ASMT-SCHEDULE", { ...subject, unexercised: [] }]]),
      changedSince: () => ["backend/a.ts"],
      covers: () => true,
    });
    assert.deepEqual(classifyEvidence(graph, [bound()], none).diagnostics, []);
    const commit = under("commit", { changedSince: () => ["backend/a.ts"], covers: () => true });
    assert.deepEqual(classifyEvidence(graph, [review(hash)], commit).diagnostics, []);
  });

  test("EVID006 lists up to twenty verifications and five files for each resource, and counts the rest", () => {
    const many = Array.from({ length: 7 }, (_, i) => `backend/f${i}.ts`);
    const wide: Subject = { ...subject, unexercised: [{ id: "RES-A", files: many }] };
    const at = under("subject", {
      subjects: new Map([["TEST-ASMT-SCHEDULE", wide]]),
      changedSince: () => many,
      covers: () => true,
    });
    const found = classifyEvidence(graph, [bound()], at).diagnostics.filter((d) => d.code === "EVID006");
    assert.match(
      found[0].message,
      /RES-A \(backend\/f0\.ts, backend\/f1\.ts, backend\/f2\.ts, backend\/f3\.ts, backend\/f4\.ts, and 2 more\)/,
    );
  });
});
