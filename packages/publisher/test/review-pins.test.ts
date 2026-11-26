/**
 * Review pins of two kinds (publication §3, ADR 0018, ADR 0025, BEH-REVIEW-PINS):
 * a pin without `hash`, or with `hash: content-v1`, holds the source's content
 * hash, which leaves out the lifecycle and review fields, and `hash: file-v1`
 * holds its whole-file hash. The P04 cases of tests/publication.json hold the rest.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  type Artifact,
  CONTENT_HASH_OMITS,
  contentHashOf,
  parseYaml,
  plainCarrier,
  readArtifact,
} from "@intentset/core";
import { bindReviewPins, pinHash, readReviewRecord, reviewGateHash, reviewStatus } from "../src/index.ts";
import { build, examplesDir } from "./harness.ts";

const RECORD = `---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/rule/0.3
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

/** The parsed frontmatter and the body, for contentHashOf: `review` on a rule is CORE001, so it is hashed directly. */
function parsed(source: string): Record<string, unknown> {
  const yaml = parseYaml(source.slice(4, source.indexOf("\n---\n", 4)));
  assert.ok(yaml.value !== null);
  return yaml.value;
}
function body(source: string): string {
  return source.slice(source.indexOf("\n---\n", 4) + 5);
}

function read(source: string): Artifact {
  const { artifact } = readArtifact(plainCarrier("RULE-X.md", source));
  assert.ok(artifact, "the record reads");
  return artifact;
}

test("BEH-REVIEW-PINS: the content hash ignores lifecycle, review fields, key order and quoting", () => {
  const base = read(RECORD).contentHash;
  assert.deepEqual(
    [...CONTENT_HASH_OMITS],
    ["status", "delivery", "reviewedBy", "reviewedAt", "approval", "formalizes", "review"],
  );

  const lifecycle = RECORD.replace("status: draft", "status: approved\n  delivery: built").replace(
    "audiences: [engineering]",
    "audiences: [engineering]\n  reviewedBy: maintainers\n  reviewedAt: '2026-11-12'",
  );
  assert.equal(read(lifecycle).contentHash, base, "status, delivery and the review fields");
  assert.notEqual(read(lifecycle).sourceHash, read(RECORD).sourceHash, "the whole-file hash still moves");

  // ADR 0020: how the record was approved, and where its promise came from, are not the promise.
  const approved = RECORD.replace(
    "status: draft",
    "status: approved\n  approval:\n    by: ana.reyes\n    at: '2026-11-14'\n    basis: direct",
  );
  assert.equal(read(approved).contentHash, base, "the basis of its approval");
  const rebased = approved.replace(
    "basis: direct",
    "basis: derived\n    source:\n      ref: LAN-12\n      revision: '7'",
  );
  assert.equal(read(rebased).contentHash, base, "a changed approval");
  assert.notEqual(read(rebased).sourceHash, read(approved).sourceHash, "the whole-file hash still moves");
  const formalizing = RECORD.replace(
    "audiences: [engineering]",
    "audiences: [engineering]\n  formalizes:\n    - source: LAN-12\n      anchor: criterion-3",
  );
  assert.equal(read(formalizing).contentHash, base, "the outside requirement it formalizes");
  assert.equal(read(formalizing.replace("criterion-3", "criterion-4")).contentHash, base, "a renumbered criterion");

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
  // ADR 0025: the review moved from that extension to `review`, and a content hash leaves out both, so a record's
  // content hash is the same before and after the move.
  const moved = RECORD.replace("audiences: [engineering]", "audiences: [engineering]\n  review:\n    sources: {}");
  assert.equal(contentHashOf(parsed(moved), body(moved)), base, "the review, as the core field");
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
  assert.equal(pinHash(undefined)?.(source), source.contentHash, "absent is content-v1 (ADR 0025)");
  assert.equal(pinHash("content-v1")?.(source), source.contentHash);
  assert.equal(pinHash("file-v1")?.(source), source.sourceHash);
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
            "intentset.review": review,
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

  // ADR 0020: a pin taken before a source records its approval, or names what it formalizes, stays current after.
  const before = content.artifacts.get("BEH-ASMT-SCHEDULE")?.contentHash;
  const later = build({
    section: "publication",
    name: "pins after an approval is written",
    baseline: "scheduling",
    patch: {
      "KB-ASMT-SCHEDULE.md": {
        frontmatter: {
          "intentset.status": "approved",
          "intentset.reviewedBy": "team-assessment",
          "intentset.reviewedAt": "2026-09-30",
          "intentset.review": { hash: "content-v1", sources: { ...all, "BEH-ASMT-SCHEDULE": before } },
        },
      },
      "BEH-ASMT-SCHEDULE.md": {
        frontmatter: {
          "intentset.status": "approved",
          "intentset.approval": {
            by: "ana.reyes",
            at: "2026-11-14",
            basis: "derived",
            source: { ref: "https://tracker.example/LAN-12", digest: "sha256:9f2c41d0" },
          },
          "intentset.formalizes": [{ source: "https://tracker.example/LAN-12", anchor: "criterion-3" }],
        },
      },
    },
    valid: true,
  }).graph;
  const laterStatus = reviewStatus(later, later.artifacts.get("KB-ASMT-SCHEDULE") as Artifact);
  assert.equal(laterStatus.status, "current", "writing approval and formalizes moved no pin");
  assert.deepEqual(laterStatus.changed, []);
  assert.notEqual(
    later.artifacts.get("BEH-ASMT-SCHEDULE")?.sourceHash,
    content.artifacts.get("BEH-ASMT-SCHEDULE")?.sourceHash,
    "the file did change",
  );

  const unknown = reviewed({ hash: "content-v9", sources: all });
  const status = reviewStatus(unknown, unknown.artifacts.get("KB-ASMT-SCHEDULE") as Artifact);
  assert.equal(status.status, "needs-review");
  assert.equal(status.unknownHash, "content-v9");
  assert.deepEqual(status.changed, ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"]);

  // Absent is content-v1, and file-v1 binds and matches the whole file.
  const absent = reviewed({ sources: all });
  const absentKb = absent.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  assert.equal(readReviewRecord(absentKb)?.hash, undefined);
  assert.equal(
    readReviewRecord(absentKb)?.sources["BEH-ASMT-SCHEDULE"],
    absent.artifacts.get("BEH-ASMT-SCHEDULE")?.contentHash,
  );
  assert.equal(reviewStatus(absent, absentKb).status, "current");
  const file = reviewed({ hash: "file-v1", sources: all });
  const fileKb = file.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  assert.equal(
    readReviewRecord(fileKb)?.sources["BEH-ASMT-SCHEDULE"],
    file.artifacts.get("BEH-ASMT-SCHEDULE")?.sourceHash,
  );
  assert.equal(reviewStatus(file, fileKb).status, "current");

  // A hash that is not a string is CORE001 (Core §9), and the review is dropped whole, so it reads as none.
  const notString = reviewed({ hash: 1, sources: all });
  assert.equal(readReviewRecord(notString.artifacts.get("KB-ASMT-SCHEDULE") as Artifact), null);
  assert.equal(bindReviewPins(notString).artifacts.size, notString.artifacts.size);
});

test("BEH-REVIEW-PINS: leaving `review` out of the content hash moved no pin taken before 0.3", () => {
  // These are the content-v1 pins the example's knowledge held under the extension before the review became a core
  // field: the sources' content hashes are what they were, so no review moved by migrate needs review (ADR 0025).
  const pinned: Record<string, string> = {
    "BEH-ASMT-SCHEDULE.md": "4fede99f81c782d216d698ad8d7785ee56f65ac5de0754c77c8269188a2617f4",
    "RULE-ASMT-AUTH.md": "d241506c14c5347535248974217d10661d9f006a8f706e8a41428c1fef7afc10",
    "RULE-ASMT-FUTURE.md": "a89cf09ddc011a8b0d4cd9548af70cd095fd3042d5324e77a7dca01797e07d3f",
  };
  for (const [name, hash] of Object.entries(pinned)) {
    const source = readFileSync(join(examplesDir, "scheduling", name), "utf8");
    const { artifact } = readArtifact(plainCarrier(name, source));
    assert.equal(artifact?.contentHash, hash, name);
  }
});

test("BEH-REVIEW-PINS: a self pin holds the knowledge's own text, which deprecating it does not move and editing it does", () => {
  const approved = build({
    section: "publication",
    name: "unit",
    baseline: "scheduling",
    valid: true,
  }).graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  const deprecated = build({
    section: "publication",
    name: "unit",
    baseline: "scheduling",
    patch: { "KB-ASMT-SCHEDULE.md": { frontmatter: { "intentset.status": "deprecated" } } },
    valid: true,
  }).graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  assert.equal(deprecated.ownContentHash, approved.ownContentHash, "own text leaves ending out");
  assert.notEqual(deprecated.contentHash, approved.contentHash, "the content hash names ending");
  const edited = build({
    section: "publication",
    name: "unit",
    baseline: "scheduling",
    patch: {
      "KB-ASMT-SCHEDULE.md": {
        body: "\n# Prepare a scheduled student assessment\n\n## Guidance\n\nChoose a class first.\n",
      },
    },
    valid: true,
  }).graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  assert.notEqual(edited.ownContentHash, approved.ownContentHash);
});

test("BEH-REVIEW-PINS: an unbound @current self reads as changed, and bound it matches", () => {
  const patch = {
    "KB-ASMT-SCHEDULE.md": {
      frontmatter: {
        "intentset.review": {
          sources: { "BEH-ASMT-SCHEDULE": "@current", "RULE-ASMT-AUTH": "@current", "RULE-ASMT-FUTURE": "@current" },
          self: "@current",
          gates: "@current",
        },
      },
    },
  };
  const built = build({ section: "publication", name: "unit", baseline: "scheduling", patch, valid: true });
  const bound = built.graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  assert.equal(reviewStatus(built.graph, bound).self, "unchanged");
  assert.equal(reviewStatus(built.graph, bound).gates, "unchanged");
  const unbound: Artifact = {
    ...bound,
    meta: {
      ...bound.meta,
      review: { ...(bound.meta.review as NonNullable<Artifact["meta"]["review"]>), self: "@current" },
    },
  };
  const status = reviewStatus(built.graph, unbound);
  assert.equal(status.self, "changed");
  assert.equal(status.status, "needs-review");
});

test("BEH-REVIEW-PINS: the gate hash moves with a source's audiences, visibility or availability, and not with what it promises", () => {
  const gateOf = (patch: Record<string, { frontmatter: Record<string, unknown> }>) => {
    const built = build({
      section: "publication",
      name: "unit",
      baseline: "scheduling",
      patch,
      registries: undefined,
      valid: true,
    });
    return reviewGateHash(built.graph, built.graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact);
  };
  const base = gateOf({});
  assert.notEqual(
    gateOf({ "BEH-ASMT-SCHEDULE.md": { frontmatter: { "intentset.audiences": ["engineering"] } } }),
    base,
  );
  assert.notEqual(gateOf({ "BEH-ASMT-SCHEDULE.md": { frontmatter: { "intentset.visibility": "restricted" } } }), base);
  assert.notEqual(
    gateOf({ "RULE-ASMT-AUTH.md": { frontmatter: { "intentset.audiences": ["product"] } } }),
    base,
    "a governing rule is a source too",
  );
  assert.equal(
    gateOf({ "BEH-ASMT-SCHEDULE.md": { frontmatter: { "intentset.revision": 7 } } }),
    base,
    "what a source promises is not who may see it",
  );
});
