/**
 * The help file's surfaces (publication §5, VSA §3, ADR 0028, BEH-PUBLISH-SURFACES): each surface a slice declares
 * maps to the documents published in the run that lead it, written only from an approved or deprecated built slice
 * available to the request, and the slices whose surfaces were left out are named to the operator alone. The surface
 * cases of tests/publication.json hold the rest.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { graphHash } from "@intentset/core";
import { type PublicationRequest, type PublishResult, publish, toChunks } from "../src/index.ts";
import { type Built, PUBLISHED_AT, customer, example, registriesWith, reviewed } from "./harness.ts";

const SLICE = "SLICE-ASMT-SCHEDULE.md";
const PAGE = "lantern-web:/assessments/schedule";
const AVAILABILITY = {
  products: ["PRD-LANTERN"],
  releases: ["pilot-1"],
  roles: ["teacher"],
  editions: ["standard"],
  flags: [],
};

/** An internal decision whose repository path holds no ID. */
const RETRY_POLICY =
  "---\nmarkset: 0\nintentset:\n  spec: '0.4'\n  profile: intentset/decision/0.4\n  id: ADR-ASMT-RETRY\n  type: decision\n  title: Retry failed schedule deliveries twice\n  status: draft\n  owner: team-assessment\n  visibility: internal\n  audiences:\n  - engineering\n  revision: 1\n---\n\n# Retry failed schedule deliveries twice\n\n## Context\n\nDelivery to a class can fail while the release job runs.\n\n## Decision\n\nRetry a failed delivery twice before reporting it.\n\n## Consequences\n\nA delivery can arrive up to two retry intervals late.\n";

/** The example's slice made eligible, with these surfaces and frontmatter edits, and its knowledge reviewed. */
function eligible(
  surfaces: Record<string, { knowledge: string[] }> = { [PAGE]: { knowledge: ["KB-ASMT-SCHEDULE"] } },
  extra: Record<string, unknown> = {},
  kb: Record<string, unknown> = reviewed(),
): Built {
  return example({
    kb,
    patch: {
      [SLICE]: {
        frontmatter: {
          "intentset.status": "approved",
          "intentset.delivery": "built",
          "intentset.availability": AVAILABILITY,
          "intentset.slice.surfaces": surfaces,
          ...extra,
        },
      },
    },
  });
}

/** An internal projection, which admits the example's internal slice, so its omissions are named. */
const internal = (extra: Record<string, unknown> = {}) =>
  customer({ visibility: "internal", authorizedInternal: true, ...extra });

function run(built: Built, request: PublicationRequest = customer()): PublishResult {
  return publish(built.graph, built.registries, request, {
    snapshot: { commit: null, graphHash: graphHash(built.graph) },
    publishedAt: PUBLISHED_AT,
    renderHtml: "page",
  });
}

test("BEH-PUBLISH-SURFACES: an eligible slice's surface lists its published leads, and nothing is omitted", () => {
  const result = run(eligible());
  assert.deepEqual(result.help?.surfaces, { [PAGE]: { knowledge: ["KB-ASMT-SCHEDULE"] } });
  assert.deepEqual(result.omittedSurfaces, []);
  assert.deepEqual(Object.keys(result.help ?? {}), [
    "profile",
    "derived",
    "projection",
    "audience",
    "availability",
    "publishedAt",
    "knowledge",
    "surfaces",
    "tips",
    "withheldForReview",
  ]);
});

test("BEH-PUBLISH-SURFACES: each omission reason, by slice ID, once per reason", () => {
  const omitted = (built: Built, request: PublicationRequest = internal()) => run(built, request).omittedSurfaces;
  const one = (reason: string) => [{ slice: "SLICE-ASMT-SCHEDULE", reason }];
  assert.deepEqual(omitted(eligible(undefined, { "intentset.status": "draft" })), one("draft"));
  assert.deepEqual(omitted(eligible(undefined, { "intentset.delivery": "planned" })), one("not-built"));
  assert.deepEqual(omitted(eligible(undefined, { "intentset.availability": null })), one("availability-missing"));
  assert.deepEqual(
    omitted(eligible(undefined, { "intentset.availability": { ...AVAILABILITY, releases: ["pilot-2"] } })),
    one("unavailable"),
  );
  assert.deepEqual(
    omitted(eligible({ x: { knowledge: ["KB-ASMT-SCHEDULE"] } }, {}, { "intentset.status": "draft" })),
    one("nothing-published"),
  );
  // A key holding the ID of a record the projection does not admit, or the path of a record not published, is a
  // reference. The slice is made customer-visible so that a customer projection names its omission.
  const visible = { "intentset.visibility": "customer" };
  const scenario = { "lantern-web:/SCN-ASMT-SCHEDULE": { knowledge: ["KB-ASMT-SCHEDULE"] } };
  assert.deepEqual(omitted(eligible(scenario, visible), customer()), one("reference"));
  assert.deepEqual(run(eligible(scenario), internal()).help?.surfaces, scenario, "an internal projection admits it");
  assert.deepEqual(
    omitted(eligible({ "docs:BEH-ASMT-SCHEDULE.md": { knowledge: ["KB-ASMT-SCHEDULE"] } })),
    one("reference"),
  );
  // The requested product's own ID is not a reference.
  assert.deepEqual(run(eligible({ "PRD-LANTERN:/schedule": { knowledge: ["KB-ASMT-SCHEDULE"] } })).help?.surfaces, {
    "PRD-LANTERN:/schedule": { knowledge: ["KB-ASMT-SCHEDULE"] },
  });
});

test("BEH-PUBLISH-SURFACES: a key holding an unpublished record's path as whole segments is a reference, after a slash too", () => {
  const one = [{ slice: "SLICE-ASMT-SCHEDULE", reason: "reference" }];
  const lead = { knowledge: ["KB-ASMT-SCHEDULE"] };
  // A customer-visible slice passes the ID test, so only the path test can refuse a key holding its own path.
  const visible = { "intentset.visibility": "customer" };
  for (const key of [
    "lantern-web:/SLICE-ASMT-SCHEDULE.md",
    "/SLICE-ASMT-SCHEDULE.md",
    "/SLICE-ASMT-SCHEDULE.md/edit",
  ]) {
    const result = run(eligible({ [key]: lead }, visible));
    assert.deepEqual(result.help?.surfaces, {}, key);
    assert.deepEqual(result.omittedSurfaces, one, key);
  }
  // A nested path that holds no ID: the internal decision at decisions/retry-policy.md is never published.
  const nested = (key: string) =>
    run(
      example({
        kb: reviewed(),
        files: { "decisions/retry-policy.md": RETRY_POLICY },
        patch: {
          "BEH-ASMT-SCHEDULE.md": { frontmatter: { "intentset.links.informedBy": ["ADR-ASMT-RETRY"] } },
          [SLICE]: {
            frontmatter: {
              "intentset.status": "approved",
              "intentset.delivery": "built",
              "intentset.availability": AVAILABILITY,
              "intentset.slice.surfaces": { [key]: lead },
            },
          },
        },
      }),
    ).help?.surfaces;
  for (const key of ["lantern-web:/decisions/retry-policy.md", "lantern-web:/app/decisions/retry-policy.md#top"]) {
    assert.deepEqual(nested(key), {}, key);
  }
  // The boundary: the same characters inside a longer segment are not the path.
  const near = "lantern-web:/old-decisions/retry-policy.md";
  assert.deepEqual(nested(near), { [near]: lead });
});

test("BEH-PUBLISH-SURFACES: a restricted slice writes its surface only for a request authorized for restricted data", () => {
  const built = eligible(undefined, { "intentset.visibility": "restricted" });
  for (const request of [customer(), internal()]) {
    const plain = run(built, request);
    assert.deepEqual(plain.help?.surfaces, {});
    // Neither projection admits a restricted slice, so the operator is not told of it either.
    assert.deepEqual(plain.omittedSurfaces, []);
  }
  const authorized = run(
    built,
    customer({ visibility: "restricted", authorizedRestricted: true, authorizedInternal: true }),
  );
  assert.deepEqual(authorized.help?.surfaces, { [PAGE]: { knowledge: ["KB-ASMT-SCHEDULE"] } });
  // authorizedRestricted lifts the condition for a narrower projection too: the slice's key is the only thing written.
  assert.deepEqual(run(built, customer({ authorizedRestricted: true })).help?.surfaces, {
    [PAGE]: { knowledge: ["KB-ASMT-SCHEDULE"] },
  });
});

test("BEH-PUBLISH-SURFACES: an internal slice's omission is named to an internal projection and not to a customer one", () => {
  const draft = eligible(undefined, { "intentset.status": "draft" });
  assert.deepEqual(run(draft, internal()).omittedSurfaces, [{ slice: "SLICE-ASMT-SCHEDULE", reason: "draft" }]);
  assert.deepEqual(
    run(draft).omittedSurfaces,
    [],
    "a customer projection does not admit the internal slice, so it is neither named nor counted",
  );
  const customerSlice = eligible(undefined, { "intentset.status": "draft", "intentset.visibility": "customer" });
  assert.deepEqual(run(customerSlice).omittedSurfaces, [{ slice: "SLICE-ASMT-SCHEDULE", reason: "draft" }]);
});

test("BEH-PUBLISH-SURFACES: a surface whose only lead is kept under review is written under keepUnderReview, and not without", () => {
  const stale = { "BEH-ASMT-SCHEDULE": "0".repeat(64), "RULE-ASMT-AUTH": "@current", "RULE-ASMT-FUTURE": "@current" };
  const built = eligible(
    undefined,
    {},
    reviewed({ "intentset.review": { sources: stale, self: "@current", gates: "@current" } }),
  );
  const without = run(built, internal());
  assert.deepEqual(without.help?.surfaces, {});
  assert.deepEqual(without.omittedSurfaces, [{ slice: "SLICE-ASMT-SCHEDULE", reason: "nothing-published" }]);
  const kept = run(built, customer({ keepUnderReview: true }));
  assert.deepEqual(kept.help?.surfaces, { [PAGE]: { knowledge: ["KB-ASMT-SCHEDULE"] } });
  assert.equal(kept.help?.knowledge[0].underReview, true);
});

test("BEH-PUBLISH-SURFACES: one of a multi-role request's roles admits the slice", () => {
  const registries = registriesWith({ roles: ["administrator", "teacher"] });
  const built = example({
    kb: reviewed(),
    registries,
    patch: {
      [SLICE]: {
        frontmatter: {
          "intentset.status": "approved",
          "intentset.delivery": "built",
          "intentset.availability": { ...AVAILABILITY, roles: ["administrator"] },
          "intentset.slice.surfaces": { [PAGE]: { knowledge: ["KB-ASMT-SCHEDULE"] } },
        },
      },
    },
  });
  assert.deepEqual(run(built, customer({ role: ["teacher", "administrator"] })).help?.surfaces, {
    [PAGE]: { knowledge: ["KB-ASMT-SCHEDULE"] },
  });
  assert.deepEqual(run(built).help?.surfaces, {});
  assert.deepEqual(run(built, internal()).omittedSurfaces, [{ slice: "SLICE-ASMT-SCHEDULE", reason: "unavailable" }]);
});

test("BEH-PUBLISH-SURFACES: a surface declared by two slices is written from neither, whatever their statuses", () => {
  const second = (status: string) =>
    [
      "---",
      "markset: 0",
      "intentset:",
      "  spec: '0.4'",
      "  profile: intentset/slice/0.4",
      "  id: SLICE-ASMT-HELP",
      "  type: slice",
      "  title: Assessment help wiring",
      `  status: ${status}`,
      "  delivery: built",
      "  owner: team-assessment",
      "  visibility: internal",
      "  audiences: [engineering]",
      "  revision: 1",
      "  availability:",
      "    products: [PRD-LANTERN]",
      "    releases: [pilot-1]",
      "    roles: [teacher]",
      "    editions: [standard]",
      "    flags: []",
      "  slice:",
      "    kind: technical",
      "    rationale: Shared help wiring.",
      "    domain: assessment",
      "    entrypoints: [src/features/assessment/help/index.ts]",
      "    layers: {}",
      "    claims:",
      "    - kind: source",
      "      path: src/features/assessment/help/**",
      "    usesResources: []",
      "    surfaces:",
      `      ${PAGE}:`,
      "        knowledge: [KB-ASMT-SCHEDULE]",
      "---",
      "",
      "# Assessment help wiring",
      "",
    ].join("\n");
  for (const status of ["approved", "draft"]) {
    const built = example({
      kb: reviewed(),
      files: { "SLICE-ASMT-HELP.md": second(status) },
      patch: {
        [SLICE]: {
          frontmatter: {
            "intentset.status": "approved",
            "intentset.delivery": "built",
            "intentset.availability": AVAILABILITY,
            "intentset.slice.surfaces": { [PAGE]: { knowledge: ["KB-ASMT-SCHEDULE"] } },
          },
        },
      },
    });
    const result = run(built, internal());
    assert.deepEqual(result.help?.surfaces, {}, status);
    assert.ok(result.omittedSurfaces.some((o) => o.slice === "SLICE-ASMT-SCHEDULE" && o.reason === "declared-twice"));
  }
});

test("BEH-PUBLISH-SURFACES: keys are written in code-unit order through JSON.stringify, digit-led keys included", () => {
  const result = run(
    eligible({
      "lantern-web:/z": { knowledge: ["KB-ASMT-SCHEDULE"] },
      "/2": { knowledge: ["KB-ASMT-SCHEDULE"] },
      "1a": { knowledge: ["KB-ASMT-SCHEDULE"] },
    }),
  );
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(result.help)).surfaces), ["/2", "1a", "lantern-web:/z"]);
});

test("BEH-PUBLISH-SURFACES: no document, page or chunk carries surfaces, and a change to them moves only help.json", () => {
  const one = run(eligible());
  const other = run(eligible({ "lantern-web:/other": { knowledge: ["KB-ASMT-SCHEDULE"] } }));
  for (const result of [one, other]) {
    for (const document of result.documents) {
      assert.doesNotMatch(document.markset, /\bsurfaces:|lantern-web/);
      assert.doesNotMatch(document.html ?? "", /&quot;surfaces&quot;|\bsurfaces:|lantern-web/);
    }
    for (const chunk of toChunks(result.documents)) assert.doesNotMatch(JSON.stringify(chunk), /surfaces|lantern-web/);
  }
  assert.notEqual(JSON.stringify(one.help), JSON.stringify(other.help));
  assert.deepEqual(
    one.documents.map((d) => [d.markset, d.html]),
    other.documents.map((d) => [d.markset, d.html]),
  );
  assert.deepEqual(toChunks(one.documents), toChunks(other.documents));
  assert.deepEqual(one.index, other.index);
  // The graph hash, and so the snapshot file, does move: surfaces are part of the slice's record.
  assert.notDeepEqual(one.snapshot, other.snapshot);
});
