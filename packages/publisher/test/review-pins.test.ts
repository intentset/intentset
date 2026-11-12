/**
 * Review pins of two kinds (publication §3, ADR 0018, BEH-REVIEW-PINS): a pin
 * without `hash` holds the source's whole-file hash, and `hash: content-v1`
 * holds its content hash, which leaves out the lifecycle and review fields.
 * The P04 cases of tests/publication.json hold the rest.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Artifact, CONTENT_HASH_OMITS, contentHashOf, plainCarrier, readArtifact } from "@intentset/core";
import { bindReviewPins, pinHash, readReviewRecord, reviewStatus } from "../src/index.ts";
import { build } from "./harness.ts";

const RECORD = `---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/rule/0.2
  id: RULE-X
  type: rule
  title: Keep it short
  status: draft
  owner: maintainers
  visibility: internal
  audiences: [engineering]
---

# Keep it short

## Constraint

Short.
`;

function read(source: string): Artifact {
  const { artifact } = readArtifact(plainCarrier("RULE-X.md", source));
  assert.ok(artifact, "the record reads");
  return artifact;
}

test("BEH-REVIEW-PINS: the content hash ignores lifecycle, review fields, key order and quoting", () => {
  const base = read(RECORD).contentHash;
  assert.deepEqual([...CONTENT_HASH_OMITS], ["status", "delivery", "reviewedBy", "reviewedAt"]);

  const lifecycle = RECORD.replace("status: draft", "status: implemented\n  delivery: built").replace(
    "audiences: [engineering]",
    "audiences: [engineering]\n  reviewedBy: maintainers\n  reviewedAt: '2026-11-12'",
  );
  assert.equal(read(lifecycle).contentHash, base, "status, delivery and the review fields");
  assert.notEqual(read(lifecycle).sourceHash, read(RECORD).sourceHash, "the whole-file hash still moves");

  const reordered = RECORD.replace(
    "  title: Keep it short\n  status: draft\n",
    "  status: draft\n  title: 'Keep it short'\n",
  );
  assert.equal(read(reordered).contentHash, base, "key order and quoting are not content");

  const pins = RECORD.replace(
    "audiences: [engineering]",
    "audiences: [engineering]\n  extensions:\n    intentset.org/review:\n      sources: {}",
  );
  assert.equal(read(pins).contentHash, base, "the review extension, and `extensions` left empty without it");
  const other = RECORD.replace(
    "audiences: [engineering]",
    "audiences: [engineering]\n  extensions:\n    org.example/x: 1",
  );
  assert.notEqual(read(other).contentHash, base, "any other extension is content");
});

test("BEH-REVIEW-PINS: the content hash moves for the promise, and when the record is going away", () => {
  const base = read(RECORD).contentHash;
  assert.notEqual(read(RECORD.replace("Short.", "Shorter.")).contentHash, base, "the body");
  assert.notEqual(
    read(RECORD.replace("audiences: [engineering]", "audiences: [engineering, product]")).contentHash,
    base,
  );
  for (const status of ["deprecated", "retired"]) {
    assert.notEqual(read(RECORD.replace("status: draft", `status: ${status}`)).contentHash, base, status);
  }
  assert.notEqual(
    read(RECORD.replace("status: draft", "status: deprecated")).contentHash,
    read(RECORD.replace("status: draft", "status: retired")).contentHash,
    "deprecated and retired are told apart",
  );
  assert.equal(
    contentHashOf({ markset: 0, intentset: { id: "RULE-X", status: "approved" } }, "x"),
    contentHashOf({ intentset: { id: "RULE-X" }, markset: 0 }, "x"),
  );
});

test("BEH-REVIEW-PINS: a review names its pin kind in `hash`, and an unknown kind matches nothing", () => {
  const source = read(RECORD);
  assert.equal(pinHash(undefined)?.(source), source.sourceHash);
  assert.equal(pinHash("content-v1")?.(source), source.contentHash);
  assert.equal(pinHash("content-v9"), null);

  const reviewed = (review: Record<string, unknown>) =>
    build({
      section: "publication",
      name: "pins",
      baseline: "scheduling",
      patch: {
        "KB-ASMT-SCHEDULE.md": {
          frontmatter: {
            "intentset.status": "approved",
            "intentset.reviewedBy": "team-assessment",
            "intentset.reviewedAt": "2026-09-30",
            "intentset.extensions": { "intentset.org/review": review },
          },
        },
        "BEH-ASMT-SCHEDULE.md": { frontmatter: { "intentset.status": "approved" } },
      },
      valid: true,
    }).graph;
  const all = { "BEH-ASMT-SCHEDULE": "@current", "RULE-ASMT-AUTH": "@current", "RULE-ASMT-FUTURE": "@current" };

  const content = reviewed({ hash: "content-v1", sources: all });
  const kb = content.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  assert.equal(readReviewRecord(kb)?.hash, "content-v1");
  const pinned = readReviewRecord(kb)?.sources["BEH-ASMT-SCHEDULE"];
  assert.equal(pinned, content.artifacts.get("BEH-ASMT-SCHEDULE")?.contentHash, "@current binds the record's kind");
  assert.equal(reviewStatus(content, kb).status, "current");

  const unknown = reviewed({ hash: "content-v9", sources: all });
  const status = reviewStatus(unknown, unknown.artifacts.get("KB-ASMT-SCHEDULE") as Artifact);
  assert.equal(status.status, "needs-review");
  assert.equal(status.unknownHash, "content-v9");
  assert.deepEqual(status.changed, ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"]);

  const notString = reviewed({ hash: 1, sources: all });
  assert.equal(readReviewRecord(notString.artifacts.get("KB-ASMT-SCHEDULE") as Artifact)?.hash, "1");
  assert.equal(bindReviewPins(notString).artifacts.size, notString.artifacts.size);
});
