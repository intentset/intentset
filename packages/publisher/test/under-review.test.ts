/**
 * Knowledge kept under review (publication §2 to §5, ADR 0027, BEH-PUBLISH-UNDER-REVIEW): knowledge whose sources
 * changed what they promise, but not who may see them, and whose own text is the text its review covered, published
 * when a request names `keepUnderReview`, marked, apart from current documents, and never chunked. The P04 cases of
 * tests/publication.json hold the rest.
 */
import assert from "node:assert/strict";
import { dirname, relative } from "node:path";
import { test } from "node:test";
import { type Artifact, graphHash } from "@intentset/core";
import {
  type PublicationRequest,
  type PublishResult,
  UNDER_REVIEW_NOTE,
  keptBody,
  publish,
  renderFragment,
  reviewStatus,
  toChunks,
} from "../src/index.ts";
import { type Built, PUBLISHED_AT, customer, example, registriesWith, reviewed } from "./harness.ts";

const STALE = { "BEH-ASMT-SCHEDULE": "0".repeat(64), "RULE-ASMT-AUTH": "@current", "RULE-ASMT-FUTURE": "@current" };
/** The example's knowledge reviewed with its own text and gates pinned, and the behavior's pin stale. */
const KEPT = reviewed({ "intentset.review": { sources: STALE, self: "@current", gates: "@current" } });

function publishBuilt(built: Built, request: PublicationRequest, commit: string | null = null): PublishResult {
  return publish(built.graph, built.registries, request, {
    snapshot: { commit, graphHash: graphHash(built.graph) },
    publishedAt: PUBLISHED_AT,
  });
}

const kb = (built: Built) => built.graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;

test("BEH-PUBLISH-UNDER-REVIEW: keepable knowledge is published under review only when the request asks", () => {
  const built = example({ kb: KEPT });
  const status = reviewStatus(built.graph, kb(built));
  assert.equal(status.status, "needs-review");
  assert.equal(status.keepable, true);
  assert.deepEqual(status.keepBlockers, []);

  const without = publishBuilt(built, customer());
  assert.deepEqual(without.index.keptUnderReview, []);
  assert.deepEqual(without.keptUnderReview, []);
  assert.deepEqual(without.index.excludedCounts["needs-review"], 1);

  const kept = publishBuilt(built, customer({ keepUnderReview: true }));
  assert.equal(kept.ok, true);
  assert.deepEqual(kept.documents, [], "documents stay current only");
  assert.deepEqual(kept.index.published, []);
  assert.deepEqual(kept.index.keptUnderReview, ["KB-ASMT-SCHEDULE"]);
  assert.equal(kept.index.excludedCounts["needs-review"], undefined, "a kept document is published, not excluded");
  const [document] = kept.keptUnderReview;
  assert.equal(document.path, "under-review/KB-ASMT-SCHEDULE.md");
  assert.equal(document.publication.underReview, true);
  assert.deepEqual(document.publication.changedSinceReview, { changed: [], withheldChanged: 1 });
  assert.ok(document.markset.includes(`# Prepare a scheduled student assessment\n\n${UNDER_REVIEW_NOTE}`));
});

test("BEH-PUBLISH-UNDER-REVIEW: each condition of keepable fails on its own", () => {
  const blockers = (fields: Parameters<typeof example>[0]) => {
    const built = example(fields);
    const status = reviewStatus(built.graph, kb(built));
    return { keepable: status.keepable, blockers: status.keepBlockers };
  };
  const review = (changes: Record<string, unknown>) =>
    reviewed({ "intentset.review": { sources: STALE, self: "@current", gates: "@current", ...changes } });
  assert.deepEqual(blockers({ kb: reviewed() }), { keepable: false, blockers: ["current"] });
  assert.deepEqual(blockers({ kb: reviewed({ "intentset.review": { sources: STALE } }) }).blockers, [
    "self-unpinned",
    "gates-unpinned",
  ]);
  assert.deepEqual(blockers({ kb: review({ self: "0".repeat(64) }) }).blockers, ["self-changed"]);
  assert.deepEqual(blockers({ kb: review({ gates: "0".repeat(64) }) }).blockers, ["gates-changed"]);
  assert.deepEqual(blockers({ kb: review({ hash: "content-v9" }) }).blockers, ["unknown-hash"]);
  assert.deepEqual(
    blockers({
      kb: reviewed({
        "intentset.review": {
          sources: { "BEH-ASMT-SCHEDULE": "0".repeat(64), "RULE-ASMT-FUTURE": "@current" },
          self: "@current",
          gates: "@current",
        },
      }),
    }).blockers,
    ["pin-missing"],
  );
  assert.deepEqual(
    blockers({
      kb: reviewed({
        "intentset.reviewedAt": null,
        "intentset.review": { sources: STALE, self: "@current", gates: "@current" },
      }),
    }).blockers,
    ["no-reviewer"],
  );
  // Only the own text changed: no source moved, so there is nothing a review could keep it under.
  assert.deepEqual(
    blockers({
      kb: reviewed({
        "intentset.review": {
          sources: { "BEH-ASMT-SCHEDULE": "@current", "RULE-ASMT-AUTH": "@current", "RULE-ASMT-FUTURE": "@current" },
          self: "0".repeat(64),
          gates: "@current",
        },
      }),
    }).blockers,
    ["no-source-changed", "self-changed"],
  );
});

test("BEH-PUBLISH-UNDER-REVIEW: a retired source makes knowledge not keepable", () => {
  const built = example({
    kb: KEPT,
    patch: {
      "RULE-ASMT-AUTH.md": {
        frontmatter: { "intentset.status": "retired", "intentset.replacedBy": "RULE-ASMT-FUTURE" },
      },
    },
  });
  const status = reviewStatus(built.graph, kb(built));
  assert.equal(status.keepable, false);
  assert.ok(status.keepBlockers.includes("source-retired"), status.keepBlockers.join(", "));
});

test("BEH-PUBLISH-UNDER-REVIEW: CORE008 says which condition of keepable failed, or that the request did not ask", () => {
  const remediation = (fields: Parameters<typeof example>[0], request: PublicationRequest) => {
    const result = publishBuilt(example(fields), request);
    const d = result.diagnostics.find((x) => x.code === "CORE008");
    assert.ok(d !== undefined, JSON.stringify(result.diagnostics));
    return { field: d.field, remediation: d.remediation, message: d.message };
  };
  const ids = { ids: ["KB-ASMT-SCHEDULE"] };
  assert.match(remediation({ kb: KEPT }, customer(ids)).remediation, /set keepUnderReview/);
  const edited = remediation(
    { kb: reviewed({ "intentset.review": { sources: STALE, self: "0".repeat(64), gates: "@current" } }) },
    customer({ ...ids, keepUnderReview: true }),
  );
  assert.equal(edited.field, "/intentset/review/self");
  assert.match(edited.message, /its own text changed since review/);
  assert.match(edited.remediation, /own text changed since it was reviewed/);
  const current = { "BEH-ASMT-SCHEDULE": "@current", "RULE-ASMT-AUTH": "@current", "RULE-ASMT-FUTURE": "@current" };
  const ownTextOnly = remediation(
    { kb: reviewed({ "intentset.review": { sources: current, self: "0".repeat(64), gates: "@current" } }) },
    customer({ ...ids, keepUnderReview: true }),
  );
  assert.equal(ownTextOnly.field, "/intentset/review/self");
  assert.match(ownTextOnly.message, /its own text changed since review/);
  assert.match(ownTextOnly.remediation, /own text changed since it was reviewed, so it cannot be kept under review/);
  assert.match(
    remediation(
      { kb: reviewed({ "intentset.review": { sources: STALE, self: "@current", gates: "0".repeat(64) } }) },
      customer({ ...ids, keepUnderReview: true }),
    ).remediation,
    /audiences, visibility or availability changed/,
  );
  assert.match(
    remediation(
      { kb: reviewed({ "intentset.review": { sources: STALE } }) },
      customer({ ...ids, keepUnderReview: true }),
    ).remediation,
    /does not pin its own text/,
  );
});

test("BEH-PUBLISH-UNDER-REVIEW: a kept document is never chunked", () => {
  const kept = publishBuilt(example({ kb: KEPT }), customer({ keepUnderReview: true }));
  assert.deepEqual(toChunks(kept.keptUnderReview), []);
  assert.deepEqual(toChunks([...kept.documents, ...kept.keptUnderReview]), []);
});

test("BEH-PUBLISH-UNDER-REVIEW: a request with keepUnderReview publishes the same current documents, byte for byte", () => {
  const other = `---
markset: 0
intentset:
  spec: '0.4'
  profile: intentset/knowledge/0.4
  id: KB-ASMT-CLASSES
  type: knowledge
  title: Choose a class
  status: approved
  owner: team-assessment
  visibility: customer
  audiences:
  - teacher
  revision: 1
  reviewedBy: team-assessment
  reviewedAt: '2026-09-30'
  links:
    explains:
    - BEH-ASMT-SCHEDULE
  availability:
    products:
    - PRD-LANTERN
    releases:
    - pilot-1
    roles:
    - teacher
    editions:
    - standard
    flags: []
  review:
    sources:
      BEH-ASMT-SCHEDULE: '@current'
      RULE-ASMT-AUTH: '@current'
      RULE-ASMT-FUTURE: '@current'
---

# Choose a class

## Guidance

Choose the class first; only classes you manage are offered.
`;
  const built = example({ kb: KEPT, files: { "KB-ASMT-CLASSES.md": other } });
  const without = publishBuilt(built, customer());
  const kept = publishBuilt(built, customer({ keepUnderReview: true }));
  assert.deepEqual(kept.documents, without.documents);
  assert.deepEqual(
    kept.documents.map((d) => d.id),
    ["KB-ASMT-CLASSES"],
  );
  // The index's request records keepUnderReview last, and only when it is true.
  assert.deepEqual(Object.keys(kept.index.request ?? {}), [
    "visibility",
    "audience",
    "product",
    "release",
    "role",
    "edition",
    "flags",
    "keepUnderReview",
  ]);
  assert.equal(Object.hasOwn(without.index.request ?? {}, "keepUnderReview"), false);
  // A run that keeps nothing writes the same bytes with and without the flag, but for the index's request.
  const nothing = example({ kb: reviewed() });
  const a = publishBuilt(nothing, customer());
  const b = publishBuilt(nothing, customer({ keepUnderReview: true }));
  assert.deepEqual(b.documents, a.documents);
  assert.deepEqual(b.help, a.help);
  assert.deepEqual({ ...b.index, request: null }, { ...a.index, request: null });
});

test("BEH-PUBLISH-UNDER-REVIEW: a kept document's output is the same bytes at two commits", () => {
  const built = example({ kb: KEPT });
  const one = publishBuilt(built, customer({ keepUnderReview: true }), "a".repeat(40));
  const two = publishBuilt(built, customer({ keepUnderReview: true }), "b".repeat(40));
  assert.deepEqual(two.keptUnderReview, one.keptUnderReview);
  assert.deepEqual(two.help, one.help);
  assert.deepEqual(two.index, one.index);
});

test("BEH-PUBLISH-UNDER-REVIEW: the note is a block of its own, whatever follows the title heading", () => {
  const built = example({ kb: KEPT });
  const note = UNDER_REVIEW_NOTE.replace(/\n$/, "");
  const kept = (body: string) => keptBody({ ...kb(built), body }, built.graph, new Set());

  const tight = kept("\n# Title\nThe first paragraph of the article.\n");
  assert.equal(tight.body, `\n# Title\n\n${note}\n\nThe first paragraph of the article.\n`);
  assert.deepEqual([tight.noteAfterLine, tight.noteLines], [2, 4]);
  const html = renderFragment(tight.body);
  const callout = /<div class="ms-callout-body">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
  assert.doesNotMatch(callout, /first paragraph/, "the article's paragraph stays outside the note");
  assert.match(html, /<p>The first paragraph of the article\.<\/p>/);

  const spaced = kept("\n# Title\n\nThe first paragraph.\n");
  assert.equal(
    spaced.body,
    `\n# Title\n\n${note}\n\nThe first paragraph.\n`,
    "an existing blank line is the one after",
  );
  assert.deepEqual([spaced.noteAfterLine, spaced.noteLines], [2, 3]);

  const setext = kept("\nTitle\n=====\nThe first paragraph.\n");
  assert.equal(setext.body, `\nTitle\n=====\n\n${note}\n\nThe first paragraph.\n`, "a setext heading stays whole");

  const untitled = kept("The first paragraph.\n");
  assert.equal(untitled.body, `${note}\n\nThe first paragraph.\n`);
  assert.deepEqual([untitled.noteAfterLine, untitled.noteLines], [0, 3]);
});

test("BEH-PUBLISH-UNDER-REVIEW: a kept document's link to a current document gets ../ whatever escapes its destination holds", () => {
  const built = example({ kb: KEPT });
  const own = kb(built);
  const target = built.graph.artifacts.get("BEH-ASMT-SCHEDULE") as Artifact;
  const file = relative(dirname(own.path), target.path);
  const links = [
    `[a](${file})`,
    `[b](${file}#a\\_b)`,
    `[c](${file}#r&eacute;sum&eacute;)`,
    `[d](<${file}#a\\_b> "title")`,
    `[e](${file}?q=&amp;)`,
    "[f][g]",
    "",
    `[g]: ${file}#&#x41;`,
  ];
  const kept = keptBody({ ...own, body: `${links.join("\n")}\n` }, built.graph, new Set(["BEH-ASMT-SCHEDULE"]));
  const prefixed = kept.body.split("\n").filter((line) => line.includes(file));
  assert.equal(prefixed.length, 6);
  for (const line of prefixed) assert.ok(line.includes(`../${file}`), line);
  const inName = [file.replace("BEH-", "BEH\\-"), file.replace("BEH-", "BEH&#45;"), file.replace("BEH-", "BEH&#x2D;")];
  for (const written of inName) {
    assert.notEqual(written, file);
    const escaped = keptBody(
      { ...own, body: `[a](${written})\n[b](<${written}#x>)\n\n[c]: ${written}\n` },
      built.graph,
      new Set(["BEH-ASMT-SCHEDULE"]),
    );
    const expected = `[a](../${written})\n[b](<../${written}#x>)\n\n[c]: ../${written}\n`;
    assert.ok(
      escaped.body.endsWith(expected),
      `an escape or a character reference in the file name gets ../: ${escaped.body}`,
    );
  }
  const untouched = keptBody({ ...own, body: `[a](${file}x#a\\_b)\n` }, built.graph, new Set(["BEH-ASMT-SCHEDULE"]));
  assert.doesNotMatch(untouched.body, /\.\.\//, "a destination naming another file is left as written");
});

test("BEH-PUBLISH-UNDER-REVIEW: a kept page carries noindex and a kept fragment is wrapped, a current one neither", () => {
  const built = example({ kb: KEPT });
  const request = customer({ keepUnderReview: true });
  const page = publish(built.graph, built.registries, request, {
    snapshot: { commit: null, graphHash: graphHash(built.graph) },
    publishedAt: PUBLISHED_AT,
    renderHtml: "page",
  }).keptUnderReview[0];
  assert.match(page.html ?? "", /<meta name="robots" content="noindex">/);
  assert.match(page.html ?? "", /Under review: what this article explains has changed since it was reviewed\./);
  const fragment = publish(built.graph, built.registries, request, {
    snapshot: { commit: null, graphHash: graphHash(built.graph) },
    publishedAt: PUBLISHED_AT,
    renderHtml: "fragment",
  }).keptUnderReview[0];
  assert.match(fragment.htmlFragment ?? "", /^<div data-intentset-under-review="true">\n<div class="ms-callout"/);
  const current = example({ kb: reviewed() });
  const plain = publish(current.graph, current.registries, request, {
    snapshot: { commit: null, graphHash: graphHash(current.graph) },
    publishedAt: PUBLISHED_AT,
    renderHtml: "page",
  }).documents[0];
  assert.doesNotMatch(plain.html ?? "", /noindex|Under review:/);
});

test("BEH-PUBLISH-UNDER-REVIEW: in a run for two roles a kept document may link a current one the other role admits, and a current one may not link it", () => {
  const knowledge = (id: string, title: string, role: string, pins: string, body: string) => `---
markset: 0
intentset:
  spec: '0.4'
  profile: intentset/knowledge/0.4
  id: ${id}
  type: knowledge
  title: ${title}
  status: approved
  owner: team-assessment
  visibility: customer
  audiences:
  - teacher
  revision: 1
  reviewedBy: team-assessment
  reviewedAt: '2026-09-30'
  links:
    explains:
    - BEH-ASMT-SCHEDULE
  availability:
    products:
    - PRD-LANTERN
    releases:
    - pilot-1
    roles:
    - ${role}
    editions:
    - standard
    flags: []
  review:
    sources:
      BEH-ASMT-SCHEDULE: '${pins}'
      RULE-ASMT-AUTH: '@current'
      RULE-ASMT-FUTURE: '@current'
    self: '@current'
    gates: '@current'
---

# ${title}

## Guidance

${body}
`;
  const run = (teacherBody: string) =>
    publishBuilt(
      example({
        kb: KEPT,
        registries: registriesWith({ roles: ["administrator", "teacher"] }),
        files: {
          "KB-ASMT-ADMIN.md": knowledge(
            "KB-ASMT-ADMIN",
            "Manage class schedules",
            "administrator",
            "0".repeat(64),
            "See [the teacher's guide](KB-ASMT-TEACH.md).",
          ),
          "KB-ASMT-TEACH.md": knowledge("KB-ASMT-TEACH", "Schedule for your class", "teacher", "@current", teacherBody),
        },
      }),
      customer({ role: ["teacher", "administrator"], keepUnderReview: true }),
    );
  const linked = run("Pick the class, then the time.");
  assert.deepEqual(linked.index.published, ["KB-ASMT-TEACH"]);
  assert.deepEqual(linked.index.keptUnderReview, ["KB-ASMT-ADMIN", "KB-ASMT-SCHEDULE"]);
  const admin = linked.keptUnderReview.find((d) => d.id === "KB-ASMT-ADMIN");
  assert.ok(admin?.markset.includes("[the teacher's guide](../KB-ASMT-TEACH.md)"), admin?.markset ?? "no document");
  assert.deepEqual(admin?.publication.availability.role, ["administrator", "teacher"]);
  assert.deepEqual(linked.documents[0].publication.availability.role, ["administrator", "teacher"]);

  // The teacher's guide linking the kept one is refused, as it is without keepUnderReview; the kept one, whose only
  // link target that was, is refused in turn.
  const back = run("See [the administrator's guide](KB-ASMT-ADMIN.md).");
  assert.deepEqual(back.index.published, []);
  assert.deepEqual(back.index.keptUnderReview, ["KB-ASMT-SCHEDULE"]);
  assert.equal(back.index.excludedCounts.reference, 2);
});
