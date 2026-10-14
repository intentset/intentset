import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkEvidence, evidenceReport, hasSliceClaims, resolveBinding, subjectsFor } from "../src/index.ts";
import { COMMIT, exampleGraph, review } from "./helpers.ts";

describe("BEH-EVIDENCE-CURRENT: which binding is in force (Core §8)", () => {
  test("subject is the default where slices claim files, commit where none does", () => {
    assert.deepEqual(resolveBinding(null, true), { binding: "subject", reason: "default" });
    assert.deepEqual(resolveBinding(null, false), { binding: "commit", reason: "no-slices" });
  });

  test("a repository can ask for either, and commit is honoured without slices", () => {
    assert.deepEqual(resolveBinding("subject", true), { binding: "subject", reason: "configured" });
    assert.deepEqual(resolveBinding("commit", true), { binding: "commit", reason: "configured" });
    assert.deepEqual(resolveBinding("commit", false), { binding: "commit", reason: "configured" });
  });

  test("asking for subject where no slice claims files still falls back to commit, and says why", () => {
    assert.deepEqual(resolveBinding("subject", false), { binding: "commit", reason: "no-slices" });
  });

  test("hasSliceClaims is true for a slice with claims that is not retired", () => {
    const withClaims = exampleGraph();
    assert.equal(hasSliceClaims(withClaims.graph), true);
    const none = exampleGraph({
      patch: { "SLICE-ASMT-SCHEDULE.md": { frontmatter: { "intentset.slice.claims": [] } } },
    });
    assert.equal(hasSliceClaims(none.graph), false);
    const retired = exampleGraph({
      patch: {
        "SLICE-ASMT-SCHEDULE.md": { frontmatter: { "intentset.status": "retired" } },
      },
    });
    assert.equal(hasSliceClaims(retired.graph), false);
  });
});

describe("BEH-EVIDENCE-CURRENT: subjectsFor", () => {
  test("one subject per verification, each file hashed once however many subjects name it", () => {
    const { graph } = exampleGraph();
    const reads: string[] = [];
    const subjects = subjectsFor(graph, {
      readFile: (path) => {
        reads.push(path);
        return Buffer.from(path);
      },
      sliceFiles: new Map([["SLICE-ASMT-SCHEDULE", ["src/a.ts", "src/b.ts"]]]),
      globalInputs: ["pnpm-lock.yaml"],
      covers: () => true,
    });
    assert.deepEqual([...subjects.keys()], ["TEST-ASMT-SCHEDULE"]);
    assert.match(subjects.get("TEST-ASMT-SCHEDULE")?.hash ?? "", /^[0-9a-f]{64}$/);
    assert.equal(new Set(reads).size, reads.length, "no file is read twice");
  });
});

describe("BEH-EXPORT: the evidence report carries the binding (export 0.4)", () => {
  const { graph, hash } = exampleGraph();
  const snapshot = { commit: COMMIT, graphHash: hash };

  test("under commit binding the report names it, carries no subject, and the record is whole", () => {
    const record = review(hash, { binding: "commit" });
    const check = checkEvidence(graph, [record], { ...snapshot, binding: "commit", bindingReason: "configured" });
    const report = evidenceReport(check, 1);
    const entry = report.verifications[0];
    assert.equal(report.binding, "commit");
    assert.equal(report.bindingReason, "configured");
    assert.equal(entry.status, "current-pass");
    assert.equal(entry.binding, "commit");
    assert.equal(entry.subject, null);
    assert.equal(entry.note, null);
    assert.deepEqual(entry.latest, record);
  });

  test("the fallback for want of slice claims is said in the report", () => {
    const check = checkEvidence(graph, [], { ...snapshot, binding: "commit", bindingReason: "no-slices" });
    const report = evidenceReport(check, 0);
    assert.equal(report.binding, "commit");
    assert.equal(report.bindingReason, "no-slices");
  });

  test("under subject binding the report carries each verification's subject and the record's binding and hash", () => {
    const subjects = subjectsFor(graph, {
      readFile: (path) => Buffer.from(path),
      sliceFiles: new Map([["SLICE-ASMT-SCHEDULE", ["src/a.ts"]]]),
      globalInputs: [],
      covers: () => true,
    });
    const subject = subjects.get("TEST-ASMT-SCHEDULE")?.hash as string;
    const bound = review(hash, { binding: "subject", subjectHash: subject, commit: "1".repeat(40) });
    const current = evidenceReport(
      checkEvidence(graph, [bound], { ...snapshot, binding: "subject", bindingReason: "default", subjects }),
      1,
    );
    assert.equal(current.binding, "subject");
    assert.equal(current.bindingReason, "default");
    assert.equal(current.verifications[0].status, "current-pass");
    assert.equal(current.verifications[0].subject, subject);
    assert.equal(current.verifications[0].latest?.subjectHash, subject);
    assert.equal(current.verifications[0].latest?.binding, "subject");

    const moved = review(hash, { binding: "subject", subjectHash: "8".repeat(64), commit: "1".repeat(40) });
    const stale = evidenceReport(
      checkEvidence(graph, [moved], {
        ...snapshot,
        binding: "subject",
        bindingReason: "default",
        subjects,
        changedSince: () => ["src/a.ts"],
      }),
      1,
    );
    assert.equal(stale.verifications[0].status, "stale");
    assert.equal(stale.verifications[0].subject, subject);
    assert.match(stale.verifications[0].note ?? "", /src\/a\.ts/);
  });
});
