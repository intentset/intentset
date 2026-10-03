/**
 * Needs-review (Core §9, P04): a knowledge artifact is current only while
 * every source it explains, and every rule governing an explained behavior,
 * still has the hash its review pinned, and while it names a reviewer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Artifact, graphHash } from "@intentset/core";
import {
  CURRENT_PIN,
  REVIEW_EXTENSION,
  bindReviewPins,
  readReviewRecord,
  reviewSources,
  reviewStatus,
} from "../src/index.ts";
import { ALL_CURRENT, KB_PATH, build, example, reviewed } from "./harness.ts";

const kb = (built: { graph: { artifacts: Map<string, Artifact> } }) =>
  built.graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;

test("the review set is what is explained plus the rules governing an explained behavior", () => {
  const built = example({ kb: reviewed({ "intentset.links.explains": ["BEH-ASMT-SCHEDULE"] }) });
  assert.deepEqual(reviewSources(built.graph, kb(built)), ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"]);
  const ruleOnly = example({ kb: reviewed({ "intentset.links.explains": ["RULE-ASMT-AUTH"] }) });
  assert.deepEqual(reviewSources(ruleOnly.graph, kb(ruleOnly)), ["RULE-ASMT-AUTH"]);
});

test("current when every pin matches and a reviewer and date are named", () => {
  const built = example({ kb: reviewed() });
  assert.deepEqual(reviewStatus(built.graph, kb(built)), {
    status: "current",
    changed: [],
    missing: [],
    reviewer: "team-assessment",
    reviewedAt: "2026-09-30",
  });
});

test("a governing rule whose hash moved since review makes the knowledge need review", () => {
  const built = example({
    kb: reviewed(
      { "intentset.links.explains": ["BEH-ASMT-SCHEDULE"] },
      { ...ALL_CURRENT, "RULE-ASMT-FUTURE": "a".repeat(64) },
    ),
  });
  const status = reviewStatus(built.graph, kb(built));
  assert.equal(status.status, "needs-review");
  assert.deepEqual(status.changed, ["RULE-ASMT-FUTURE"]);
  assert.deepEqual(status.missing, []);
});

test("editing a pinned source after binding is a change", () => {
  const before = example({ kb: reviewed() });
  const pinned = readReviewRecord(kb(before))?.sources["RULE-ASMT-AUTH"] ?? "";
  assert.match(pinned, /^[0-9a-f]{64}$/);
  const after = example({
    kb: reviewed({}, { ...ALL_CURRENT, "RULE-ASMT-AUTH": pinned }),
    patch: {
      "RULE-ASMT-AUTH.md": {
        body: "\n# Require assignment permission\n\n## Constraint\n\nThe server must reject it.\n",
      },
    },
  });
  assert.deepEqual(reviewStatus(after.graph, kb(after)).changed, ["RULE-ASMT-AUTH"]);
});

test("a missing pin, a missing reviewer or a missing date each need review", () => {
  const { "RULE-ASMT-AUTH": _dropped, ...partial } = ALL_CURRENT;
  const unpinned = example({ kb: reviewed({}, partial) });
  assert.deepEqual(reviewStatus(unpinned.graph, kb(unpinned)).missing, ["RULE-ASMT-AUTH"]);
  const noReviewer = example({ kb: reviewed({ "intentset.reviewedBy": null }) });
  const status = reviewStatus(noReviewer.graph, kb(noReviewer));
  assert.equal(status.status, "needs-review");
  assert.equal(status.reviewer, null);
  const noDate = example({ kb: reviewed({ "intentset.reviewedAt": null }) });
  assert.equal(reviewStatus(noDate.graph, kb(noDate)).status, "needs-review");
  const noRecord = example({ kb: reviewed({ "intentset.extensions": null }) });
  assert.deepEqual(reviewStatus(noRecord.graph, kb(noRecord)).missing, [
    "BEH-ASMT-SCHEDULE",
    "RULE-ASMT-AUTH",
    "RULE-ASMT-FUTURE",
  ]);
});

test("bindReviewPins replaces @current with the source's hash and leaves the input and the graph hash alone", () => {
  const built = build({
    section: "publication",
    name: "raw",
    baseline: "scheduling",
    patch: { [KB_PATH]: { frontmatter: reviewed() } },
    valid: true,
  });
  // build() binds; rebuild the unbound graph by reversing that for the comparison.
  const unbound = { ...built.graph, artifacts: new Map(built.graph.artifacts) };
  const original = kb(built);
  unbound.artifacts.set("KB-ASMT-SCHEDULE", {
    ...original,
    meta: { ...original.meta, extensions: { [REVIEW_EXTENSION]: { sources: { ...ALL_CURRENT } } } },
  });
  assert.equal(reviewStatus(unbound, kb({ graph: unbound })).status, "needs-review");
  const bound = bindReviewPins(unbound);
  const sources = readReviewRecord(kb({ graph: bound }))?.sources ?? {};
  for (const id of Object.keys(ALL_CURRENT)) assert.equal(sources[id], unbound.artifacts.get(id)?.sourceHash);
  assert.equal(readReviewRecord(kb({ graph: unbound }))?.sources["BEH-ASMT-SCHEDULE"], CURRENT_PIN);
  assert.equal(graphHash(bound), graphHash(unbound));
  assert.equal(reviewStatus(bound, kb({ graph: bound })).status, "current");
});

test("an @current pin naming an artifact not in the graph stays unbound", () => {
  const built = example({ kb: reviewed({}, { ...ALL_CURRENT, "RULE-GONE": CURRENT_PIN }) });
  assert.equal(readReviewRecord(kb(built))?.sources["RULE-GONE"], CURRENT_PIN);
});
