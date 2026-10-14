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

describe("BEH-EXPORT: the evidence report leaves the binding out", () => {
  const { graph, hash } = exampleGraph();
  const snapshot = { commit: COMMIT, graphHash: hash };

  test("the latest record is the contract's own, without binding or subjectHash, and a note can be added", () => {
    const record = review(hash, { binding: "commit" });
    const check = checkEvidence(graph, [record], snapshot);
    const report = evidenceReport(check, 1, { note: "classified by commit" });
    const entry = report.verifications[0];
    assert.equal(entry.status, "current-pass");
    assert.equal(entry.note, "classified by commit");
    assert.equal(entry.latest !== null && "binding" in entry.latest, false);
    assert.equal(entry.latest?.evidenceId, record.evidenceId);
    assert.equal(evidenceReport(check, 1).verifications[0].note, null);
  });

  test("a subject record never reaches the export", () => {
    const record = review(hash, { binding: "subject", subjectHash: "8".repeat(64) });
    const report = evidenceReport(checkEvidence(graph, [record], snapshot), 1);
    assert.equal(JSON.stringify(report).includes("subjectHash"), false);
    assert.equal(JSON.stringify(report).includes('"binding"'), false);
  });
});
