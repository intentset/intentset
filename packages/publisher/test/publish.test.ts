/**
 * Generated documents (Core §9, spec/publication.md): provenance in a
 * top-level `intentset-publication` block both frontmatter readers accept, a
 * derived marker, the body unchanged, valid Markset with no new directive,
 * HTML that keeps the provenance, and the same bytes on every run.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Artifact, canonicalJson, parseYaml } from "@intentset/core";
import { BLOCK_DIRECTIVE_NAMES, parseDocument } from "@markset-lang/parser";
import { PUBLICATION_KEY, PUBLICATION_PROFILE, emitYaml, markerLine, publish } from "../src/index.ts";
import { PUBLISHED_AT, customer, example, readCases, reviewed, run, snapshotOf } from "./harness.ts";

const passing = () => example({ kb: reviewed() });

function publishOnce(request = customer()) {
  const { graph, registries } = passing();
  return publish(graph, registries, request, {
    snapshot: snapshotOf(graph),
    publishedAt: PUBLISHED_AT,
    renderHtml: true,
  });
}

test("two runs over the same inputs are byte-identical, for every fixture", () => {
  for (const testCase of readCases()) {
    const a = run(testCase).result;
    const b = run(testCase).result;
    assert.equal(canonicalJson(a), canonicalJson(b), testCase.name);
    assert.equal(JSON.stringify(a), JSON.stringify(b), testCase.name);
  }
});

test("publishedAt is the only clock: changing it changes only that field", () => {
  const { graph, registries } = passing();
  const at = (publishedAt: string) =>
    publish(graph, registries, customer(), { snapshot: snapshotOf(graph), publishedAt }).documents[0].markset;
  const a = at("2026-01-01T00:00:00Z");
  const b = at("2026-02-02T00:00:00Z");
  assert.notEqual(a, b);
  assert.equal(a.replace("2026-01-01T00:00:00Z", "X"), b.replace("2026-02-02T00:00:00Z", "X"));
});

test("the generated frontmatter reads back, through core and through Markset, as the publication block", () => {
  const [document] = publishOnce().documents;
  const lines = document.markset.split("\n");
  assert.equal(lines[0], "---");
  const close = lines.indexOf("---", 1);
  const yaml = lines.slice(1, close).join("\n");
  const read = parseYaml(yaml);
  assert.equal(read.error, null);
  assert.deepEqual(read.value, { markset: 0, [PUBLICATION_KEY]: JSON.parse(JSON.stringify(document.publication)) });
  assert.equal(Object.hasOwn(read.value ?? {}, "intentset"), false, "a generated document is never a canonical record");
  const parsed = parseDocument(document.markset);
  assert.equal(parsed.frontmatter?.markset, 0);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(lines[close + 1], markerLine("KB-ASMT-SCHEDULE"));
});

test("the publication block carries provenance and names only what the projection shows", () => {
  const { graph } = passing();
  const kb = graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  const [document] = publishOnce().documents;
  assert.equal(document.path, "KB-ASMT-SCHEDULE.md");
  assert.deepEqual(document.publication, {
    profile: PUBLICATION_PROFILE,
    derived: true,
    projection: "customer",
    source: { id: "KB-ASMT-SCHEDULE", revision: 1, sourceHash: kb.sourceHash },
    sources: [],
    withheldSources: 3,
    snapshot: snapshotOf(graph),
    audience: "teacher",
    availability: { product: "PRD-LANTERN", release: "pilot-1", role: "teacher", edition: "standard", flags: [] },
    reviewer: "team-assessment",
    reviewedAt: "2026-09-30",
    publishedAt: PUBLISHED_AT,
  });
});

test("an authorized internal projection names internal sources and the knowledge's path", () => {
  const [document] = publishOnce(customer({ visibility: "internal", authorizedInternal: true })).documents;
  assert.equal(document.publication.source.path, "KB-ASMT-SCHEDULE.md");
  assert.deepEqual(
    document.publication.sources.map((s) => s.id),
    ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"],
  );
  assert.equal(document.publication.withheldSources, 0);
  assert.equal(document.publication.projection, "internal");
});

test("availability records the request's values and only the flags the knowledge needs", () => {
  const { graph, registries } = example({
    kb: reviewed({
      "intentset.availability.flags": ["beta"],
      "intentset.availability.editions": ["district", "standard"],
    }),
    registries: {
      owners: ["team-assessment", "team-platform"],
      audiences: ["engineering", "product", "teacher"],
      releases: ["pilot-1"],
      roles: ["teacher"],
      editions: ["district", "standard"],
      flags: ["beta", "gamma"],
      resources: [
        {
          id: "RES-ASSESSMENT-DATA",
          path: "amplify/data/resource.ts",
          owner: "team-platform",
          consumers: ["SLICE-ASMT-SCHEDULE"],
        },
      ],
    },
  });
  const result = publish(graph, registries, customer({ flags: ["gamma", "beta"] }), {
    snapshot: snapshotOf(graph),
    publishedAt: PUBLISHED_AT,
  });
  assert.deepEqual(result.documents[0].publication.availability, {
    product: "PRD-LANTERN",
    release: "pilot-1",
    role: "teacher",
    edition: "standard",
    flags: ["beta"],
  });
  assert.ok(!result.documents[0].markset.includes("district"), "other editions are not disclosed");
  assert.deepEqual(result.index.request?.flags, ["beta", "gamma"]);
});

test("the body is the knowledge body, unchanged, after the marker", () => {
  const { graph } = passing();
  const kb = graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  const [document] = publishOnce().documents;
  assert.ok(document.markset.endsWith(`${markerLine("KB-ASMT-SCHEDULE")}\n${kb.body}`));
});

test("the output uses no directive outside Markset's vocabulary", () => {
  for (const testCase of readCases()) {
    for (const document of run(testCase).result.documents) {
      for (const match of document.markset.matchAll(/^\s*:{3,}\s*([A-Za-z][A-Za-z0-9_-]*)/gm)) {
        assert.ok(BLOCK_DIRECTIVE_NAMES.has(match[1]), `${testCase.name}: :::${match[1]}`);
      }
    }
  }
});

test("the HTML page carries the provenance after the charset and the stylesheet inline", () => {
  const [document] = publishOnce().documents;
  const html = document.html ?? "";
  assert.match(
    html,
    /^<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="intentset-publication" content="\{/,
  );
  assert.match(html, /<style>\n/);
  assert.match(html, /<title>Prepare a scheduled assessment<\/title>/);
  assert.ok(html.includes("&quot;source&quot;:{&quot;id&quot;:&quot;KB-ASMT-SCHEDULE&quot;"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("Generated by intentset publish"), "the marker is a source comment, not rendered");
});

test("the index names the request without authorization and counts exclusions", () => {
  const result = publishOnce(customer({ visibility: "internal", authorizedInternal: true }));
  assert.deepEqual(Object.keys(result.index), ["snapshot", "request", "published", "excludedCounts"]);
  assert.equal(Object.hasOwn(result.index.request ?? {}, "authorizedInternal"), false);
  assert.deepEqual(result.index.published, ["KB-ASMT-SCHEDULE"]);
  assert.deepEqual(result.index.excludedCounts, { "not-knowledge": 14 });
  assert.equal(result.ok, true);
});

test("a customer index counts only what the customer projection could see", () => {
  // The example's fourteen other records are all internal: an internal index
  // counts them, and a customer index must not say they exist.
  const result = publishOnce(customer());
  assert.deepEqual(result.index.published, ["KB-ASMT-SCHEDULE"]);
  assert.deepEqual(result.index.excludedCounts, {});
  assert.ok(!JSON.stringify(result.index).includes("not-knowledge"));
});

test("the YAML writer quotes anything a reader could take for another type", () => {
  assert.equal(
    emitYaml({
      a: "plain-id",
      b: "2026-01-01",
      c: "true",
      d: "it's",
      e: null,
      f: [],
      g: 3,
      h: ["x"],
      i: [{ id: "X", n: 1 }],
    }),
    "a: plain-id\nb: '2026-01-01'\nc: 'true'\nd: 'it''s'\ne: null\nf: []\ng: 3\nh:\n  - x\ni:\n  - id: X\n    'n': 1\n",
  );
  assert.throws(() => emitYaml({ a: "line\nbreak" }), /control character/);
});
