/**
 * References out of a knowledge body (Core §9, P02): bare IDs, links and
 * written-out paths to artifacts the projection does not publish fail the
 * document, an excluded title in the text fails it, and no message carries
 * the referenced artifact's title or path.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Artifact, Graph } from "@intentset/core";
import { checkReferences, checkTitles, findReferences, publish, resolveTarget, titlePattern } from "../src/index.ts";
import { PUBLISHED_AT, customer, example, guidance, reviewed, snapshotOf } from "./harness.ts";

const kb = (graph: Graph) => graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
const refs = (text: string) => {
  const { graph } = example({ kb: reviewed(), body: guidance(text) });
  return findReferences(kb(graph), graph).map((r) => `${r.id}:${r.via}`);
};

test("bare IDs are word-bounded and must name an artifact in the graph", () => {
  assert.deepEqual(refs("See RULE-ASMT-AUTH, then (BEH-ASMT-SCHEDULE)."), [
    "BEH-ASMT-SCHEDULE:id",
    "RULE-ASMT-AUTH:id",
  ]);
  assert.deepEqual(refs("XRULE-ASMT-AUTH and RULE-ASMT-AUTH-2 and RULE-ASMT-AUTHx and rule-asmt-auth"), []);
  assert.deepEqual(refs("COVID-19 and ISO-8601 are not artifacts."), []);
  assert.deepEqual(refs("In code: `ADR-ASMT-SEAM`."), ["ADR-ASMT-SEAM:id"]);
  assert.deepEqual(refs("This guidance is KB-ASMT-SCHEDULE itself."), []);
});

test("links, images, definitions and raw HTML targets resolve against the document's directory", () => {
  assert.deepEqual(refs("[a](./ADR-ASMT-SEAM.md#context)"), ["ADR-ASMT-SEAM:id", "ADR-ASMT-SEAM:link"]);
  assert.deepEqual(refs("Written out: ADR-ASMT-SEAM.md."), ["ADR-ASMT-SEAM:id", "ADR-ASMT-SEAM:path"]);
  assert.deepEqual(
    refs("[a][r]\n\n[r]: decisions/retry-policy.md").filter((r) => r.endsWith(":link")),
    [],
    "no such file in the example",
  );
  const { graph } = example({
    kb: reviewed(),
    body: guidance(
      '[a][r] and <a href="sub/../decisions/retry-policy.md">b</a> and ![c](/decisions/retry-policy.md)\n\n[r]: decisions/retry%2Dpolicy.md',
    ),
    files: {
      "decisions/retry-policy.md":
        "---\nmarkset: 0\nintentset:\n  spec: '0.1'\n  profile: intentset/decision/0.1\n  id: ADR-ASMT-RETRY\n  type: decision\n  title: Retry failed deliveries twice\n  status: approved\n  owner: team-assessment\n  visibility: internal\n  audiences:\n  - engineering\n---\n\n# Retry failed deliveries twice\n\n## Context\n\nx\n\n## Decision\n\ny\n\n## Consequences\n\nz\n",
    },
  });
  const found = findReferences(kb(graph), graph).filter((r) => r.via === "link");
  assert.equal(found.length, 3);
  assert.ok(found.every((r) => r.id === "ADR-ASMT-RETRY"));
});

test("resolveTarget keeps repository files and drops everything else", () => {
  assert.equal(resolveTarget("ADR-ASMT-SEAM.md", "KB.md"), "ADR-ASMT-SEAM.md");
  assert.equal(resolveTarget("../adr/x.md?plain#top", "docs/kb/a.md"), "docs/adr/x.md");
  assert.equal(resolveTarget("/adr/x.md", "docs/kb/a.md"), "adr/x.md");
  assert.equal(resolveTarget("my%20file.md", "a.md"), "my file.md");
  assert.equal(resolveTarget("https://example.org/ADR-ASMT-SEAM.md", "a.md"), null);
  assert.equal(resolveTarget("mailto:someone@example.org", "a.md"), null);
  assert.equal(resolveTarget("//cdn.example.org/x.md", "a.md"), null);
  assert.equal(resolveTarget("#guidance", "a.md"), null);
  assert.equal(resolveTarget("../../outside.md", "docs/a.md"), null);
});

test("an ID fails only when outside the projection; a link fails when the target is not published", () => {
  const { graph } = example({
    kb: reviewed(),
    body: guidance("Teachers on PRD-LANTERN: see KB-ASMT-SCHEDULE and RULE-ASMT-AUTH."),
  });
  const request = customer();
  const found = checkReferences(kb(graph), graph, request, new Set(["KB-ASMT-SCHEDULE"]));
  assert.deepEqual(
    found.map((d) => d.message),
    ["KB-ASMT-SCHEDULE refers to RULE-ASMT-AUTH by ID, which this customer projection does not publish."],
  );
  const internal = customer({ visibility: "internal", authorizedInternal: true });
  assert.deepEqual(
    checkReferences(kb(graph), graph, internal, new Set()),
    [],
    "an internal projection admits the rule's ID",
  );
});

test("titles: three or more words, case-sensitive, across a line break, and never a title being published", () => {
  assert.ok(titlePattern("Require a future release time").test("you Require a\nfuture  release time."));
  assert.ok(!titlePattern("Require a future release time").test("require a future release time"));
  assert.ok(!titlePattern("Require a future release time").test("Require a future release times"));
  // Every title in the example now runs to three words or more, so the capability
  // is given a two-word one here: a short title is common phrasing, and matching
  // it in prose would report a reference nobody made.
  const { graph } = example({
    kb: reviewed(),
    patch: { "CAP-ASMT-ASSIGN.md": { frontmatter: { title: "Assessment assignment" } } },
    body: guidance("Require assignment permission. Assessment assignment. Schedule a student assessment."),
  });
  const request = customer();
  const found = checkTitles(kb(graph), graph, request, new Set(["Prepare a scheduled student assessment"]));
  assert.deepEqual(
    found.map((d) => d.message),
    [
      "KB-ASMT-SCHEDULE contains the title of BEH-ASMT-SCHEDULE, which this customer projection does not admit.",
      "KB-ASMT-SCHEDULE contains the title of RULE-ASMT-AUTH, which this customer projection does not admit.",
    ],
    "the two-word capability title is not checked",
  );
  assert.deepEqual(
    checkTitles(kb(graph), graph, request, new Set(["Schedule a student assessment", "Require assignment permission"])),
    [],
  );
});

test("no reference diagnostic carries the referenced title or path", () => {
  const { graph } = example({
    kb: reviewed(),
    body: guidance("[Keep backend access behind the slice seam](ADR-ASMT-SEAM.md) and SLICE-ASMT-SCHEDULE.md."),
  });
  const request = customer();
  const text = JSON.stringify([
    ...checkReferences(kb(graph), graph, request, new Set()),
    ...checkTitles(kb(graph), graph, request, new Set()),
  ]);
  for (const leak of [
    "Keep backend access behind the slice seam",
    "ADR-ASMT-SEAM.md",
    "SLICE-ASMT-SCHEDULE.md",
    "Student assessment scheduling slice",
  ]) {
    assert.ok(!text.includes(leak), leak);
  }
  assert.match(text, /ADR-ASMT-SEAM/);
  assert.match(text, /SLICE-ASMT-SCHEDULE/);
});

test("a document linking to one refused in the same run is refused in turn", () => {
  const second =
    "---\nmarkset: 0\nintentset:\n  spec: '0.1'\n  profile: intentset/knowledge/0.1\n  id: KB-ASMT-REVIEW\n  type: knowledge\n" +
    "  title: Review a schedule\n  status: approved\n  owner: team-assessment\n  visibility: customer\n  audiences:\n  - teacher\n" +
    "  links:\n    explains:\n    - CAP-ASMT-ASSIGN\n  availability:\n    products:\n    - PRD-LANTERN\n    releases:\n    - pilot-1\n" +
    "    roles:\n    - teacher\n    editions:\n    - standard\n    flags: []\n  reviewedBy: team-assessment\n  reviewedAt: '2026-09-30'\n" +
    "  extensions:\n    intentset.org/review:\n      sources:\n        CAP-ASMT-ASSIGN: '@current'\n---\n\n# Review a schedule\n\n" +
    "## Guidance\n\nBefore confirming, read [how to prepare one](KB-ASMT-SCHEDULE.md).\n";
  const clean = example({ kb: reviewed(), files: { "KB-ASMT-REVIEW.md": second } });
  const ok = publish(clean.graph, clean.registries, customer(), {
    snapshot: snapshotOf(clean.graph),
    publishedAt: PUBLISHED_AT,
  });
  assert.deepEqual(ok.index.published, ["KB-ASMT-REVIEW", "KB-ASMT-SCHEDULE"]);
  assert.deepEqual(ok.diagnostics, []);

  const broken = example({
    kb: reviewed(),
    body: guidance("See RULE-ASMT-AUTH."),
    files: { "KB-ASMT-REVIEW.md": second },
  });
  const result = publish(broken.graph, broken.registries, customer(), {
    snapshot: snapshotOf(broken.graph),
    publishedAt: PUBLISHED_AT,
  });
  assert.deepEqual(result.index.published, []);
  assert.deepEqual(
    result.diagnostics.map((d) => `${d.artifact} ${d.message}`),
    [
      "KB-ASMT-REVIEW KB-ASMT-REVIEW refers to KB-ASMT-SCHEDULE by link and path, which this customer projection does not publish.",
      "KB-ASMT-SCHEDULE KB-ASMT-SCHEDULE refers to RULE-ASMT-AUTH by ID, which this customer projection does not publish.",
    ],
  );
  assert.deepEqual(result.index.excludedCounts.reference, 2);
});
