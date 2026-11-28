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
import {
  type HtmlRendering,
  PUBLICATION_KEY,
  PUBLICATION_PROFILE,
  checkRequest,
  emitYaml,
  generateDocument,
  helpFile,
  keptPublicationMeta,
  markerLine,
  publicationMeta,
  publish,
  type PublicationRequest,
  reviewStatus,
  toChunks,
} from "../src/index.ts";
import { safeUrl } from "../src/urls.ts";
import {
  PUBLISHED_AT,
  customer,
  example,
  guidance,
  readCases,
  registriesWith,
  reviewed,
  run,
  snapshotOf,
} from "./harness.ts";

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
  assert.deepEqual(read.value, { markset: true, [PUBLICATION_KEY]: JSON.parse(JSON.stringify(document.publication)) });
  assert.equal(Object.hasOwn(read.value ?? {}, "intentset"), false, "a generated document is never a canonical record");
  const parsed = parseDocument(document.markset);
  assert.equal(parsed.frontmatter?.markset, true);
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
    audience: ["teacher"],
    availability: { product: "PRD-LANTERN", release: "pilot-1", role: ["teacher"], edition: "standard", flags: [] },
    reviewer: "team-assessment",
    reviewedAt: "2026-09-30",
    publishedAt: PUBLISHED_AT,
  });
});

test("BEH-PUBLISH: only the snapshot file names the snapshot: a change elsewhere in the model, at another commit, moves it and nothing else", () => {
  // SCN-ASMT-SCHEDULE is neither the knowledge nor a source it pins, so editing it leaves the review current and
  // moves only the graph hash (publication §2, §5, §6; ADR 0019, ADR 0021).
  const publishFrom = (commit: string, patch: Record<string, { body: string }> = {}) => {
    const { graph, registries } = example({ kb: reviewed(), patch });
    return publish(graph, registries, customer(), {
      snapshot: { commit, graphHash: snapshotOf(graph).graphHash },
      publishedAt: PUBLISHED_AT,
      renderHtml: true,
    });
  };
  const before = publishFrom("c0ffee");
  const after = publishFrom("decade", {
    "SCN-ASMT-SCHEDULE.md": {
      body: "\n# Accept an eligible schedule\n\n## Given\n\nA teacher.\n\n## When\n\nThey schedule.\n\n## Then\n\nIt is recorded.\n",
    },
  });
  assert.equal(before.ok && after.ok, true);
  assert.notEqual(before.snapshot.graphHash, after.snapshot.graphHash);
  const [a] = before.documents;
  const [b] = after.documents;
  assert.equal(Object.hasOwn(a.publication, "snapshot"), false);
  assert.ok(!a.markset.includes("snapshot") && !a.markset.includes("graphHash") && !a.markset.includes("c0ffee"));
  assert.ok(!(a.html ?? "").includes("graphHash"));
  assert.equal(b.markset, a.markset);
  assert.equal(b.html, a.html);
  assert.deepEqual(toChunks(after.documents), toChunks(before.documents));
  // The index and the help file are the same bytes too, and neither names the snapshot.
  assert.equal(JSON.stringify(after.index), JSON.stringify(before.index));
  assert.equal(JSON.stringify(after.help), JSON.stringify(before.help));
  for (const written of [JSON.stringify(before.index), JSON.stringify(before.help)]) {
    assert.ok(!written.includes("snapshot") && !written.includes("graphHash") && !written.includes("c0ffee"));
  }
  assert.deepEqual(Object.keys(before.snapshot), ["profile", "derived", "commit", "graphHash"]);
  assert.deepEqual(before.snapshot, {
    profile: "intentset/snapshot/0.3",
    derived: true,
    commit: "c0ffee",
    graphHash: before.snapshot.graphHash,
  });
  assert.equal(after.snapshot.commit, "decade");
});

test("BEH-PUBLISH: a refused request still names the snapshot it was asked to publish from, and the file names no request", () => {
  const { graph, registries } = example({ kb: reviewed() });
  const options = { snapshot: { commit: null, graphHash: snapshotOf(graph).graphHash }, publishedAt: PUBLISHED_AT };
  const refused = publish(graph, registries, customer({ release: "no-such-release" }), options);
  assert.equal(refused.index.request, null);
  // The same bytes for every projection of one run: nothing of the request is in it.
  assert.deepEqual(refused.snapshot, publish(graph, registries, customer(), options).snapshot);
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

test("BEH-PUBLISH-READER: availability records the request's values, every flag the request holds included", () => {
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
    role: ["teacher"],
    edition: "standard",
    flags: ["beta", "gamma"],
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
  assert.match(html, /<title>Prepare a scheduled student assessment<\/title>/);
  assert.ok(html.includes("&quot;source&quot;:{&quot;id&quot;:&quot;KB-ASMT-SCHEDULE&quot;"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("Generated by intentset publish"), "the marker is a source comment, not rendered");
});

/** The example published with the given rendering, and its one document. */
function rendered(renderHtml: HtmlRendering | undefined, body?: string) {
  const { graph, registries } = example({ kb: reviewed(), ...(body !== undefined ? { body } : {}) });
  const result = publish(graph, registries, customer(), {
    snapshot: snapshotOf(graph),
    publishedAt: PUBLISHED_AT,
    ...(renderHtml !== undefined ? { renderHtml } : {}),
  });
  assert.equal(result.documents.length, 1, JSON.stringify(result.diagnostics));
  return result.documents[0];
}

/** What a page holds inside `<main>`. */
function mainOf(page: string): string {
  const open = '<main class="ms-document">\n';
  return page.slice(page.indexOf(open) + open.length, page.indexOf("</main>"));
}

test('BEH-PUBLISH-FRAGMENT: "page" is true, byte for byte, and sets the page alone; absent and false render nothing', () => {
  const page = rendered("page");
  assert.equal(page.html, rendered(true).html);
  assert.ok((page.html ?? "").startsWith("<!doctype html>"));
  assert.equal(page.htmlFragment, undefined);
  const fragment = rendered("fragment");
  assert.equal(fragment.html, undefined);
  assert.equal(typeof fragment.htmlFragment, "string");
  for (const document of [rendered(false), rendered(undefined)]) {
    assert.equal(document.html, undefined);
    assert.equal(document.htmlFragment, undefined);
  }
  assert.equal(fragment.markset, page.markset, "the rendering never changes the Markset document");
  assert.deepEqual(fragment.publication, page.publication);
});

test("BEH-PUBLISH-FRAGMENT: a fragment is the page's content without its title heading, the same bytes on every run", () => {
  const page = rendered(true).html ?? "";
  const fragment = rendered("fragment").htmlFragment ?? "";
  const title = '<h1 id="prepare-a-scheduled-student-assessment">Prepare a scheduled student assessment</h1>\n';
  assert.ok(mainOf(page).startsWith(title));
  assert.equal(fragment, mainOf(page).slice(title.length));
  assert.ok(fragment.startsWith('<h2 id="guidance">Guidance</h2>\n'), fragment);
  assert.equal(fragment, rendered("fragment").htmlFragment);
  for (const absent of ["<!doctype", "<html", "<head", "<body", "<main", "<style", "<link", "<meta", "<title", "<h1"]) {
    assert.ok(!fragment.includes(absent), `the fragment holds ${absent}`);
  }
  for (const provenance of ["intentset-publication", "KB-ASMT-SCHEDULE", "sourceHash", "publishedAt", PUBLISHED_AT]) {
    assert.ok(!fragment.includes(provenance), `the fragment carries ${provenance}; provenance is on the document`);
  }
});

test("BEH-PUBLISH-FRAGMENT: a fragment drops raw HTML as the page does", () => {
  const body = guidance(
    'Open <script>steal()</script> the <b onclick="steal()">form</b>.\n\n<iframe src="x"></iframe>',
  );
  const page = rendered(true, body).html ?? "";
  const fragment = rendered("fragment", body).htmlFragment ?? "";
  for (const raw of ["<script", "<iframe", "onclick", "<b ", "<b>"]) {
    assert.ok(!page.includes(raw), `the page holds ${raw}`);
    assert.ok(!fragment.includes(raw), `the fragment holds ${raw}`);
  }
  assert.ok(fragment.includes("form"), "the text around raw HTML is kept");
  assert.ok(mainOf(page).endsWith(fragment));
});

test("BEH-PUBLISH-FRAGMENT: boundary: only the first top-level level-one heading is left out, and a body with none loses nothing", () => {
  const twice = rendered("fragment", `${guidance("Text.")}\n# Prepare a scheduled student assessment\n\nMore.\n`);
  assert.equal(
    twice.htmlFragment,
    '<h2 id="guidance">Guidance</h2>\n<p>Text.</p>\n<h1 id="prepare-a-scheduled-student-assessment-2">Prepare a scheduled student assessment</h1>\n<p>More.</p>\n',
    "the second keeps its heading and the id the page gives it",
  );
  const none = rendered("fragment", "\n## Guidance\n\nText.\n");
  assert.equal(none.htmlFragment, '<h2 id="guidance">Guidance</h2>\n<p>Text.</p>\n');
});

test("BEH-PUBLISH-FRAGMENT: an unknown rendering is refused rather than read as none", () => {
  const { graph, registries } = passing();
  assert.throws(
    () =>
      publish(graph, registries, customer(), {
        snapshot: snapshotOf(graph),
        publishedAt: PUBLISHED_AT,
        renderHtml: "body" as HtmlRendering,
      }),
    /renderHtml "body"/,
  );
});

test("BEH-PUBLISH-FRAGMENT: fails closed: a refused request has no fragment, and no fragment names an excluded source", () => {
  const publishFragments = (request: PublicationRequest, body?: string) => {
    const { graph, registries } = example({ kb: reviewed(), ...(body !== undefined ? { body } : {}) });
    return publish(graph, registries, request, {
      snapshot: snapshotOf(graph),
      publishedAt: PUBLISHED_AT,
      renderHtml: "fragment",
    });
  };
  const refused = publishFragments(customer({ visibility: "internal" }));
  assert.equal(refused.index.request, null);
  assert.deepEqual(refused.documents, []);
  assert.equal(refused.help, null);

  // The customer projection withholds the internal behavior and rules the knowledge explains.
  const excluded = ["Schedule a student assessment", "Require a future release time", "Require assignment permission"];
  const paths = ["BEH-ASMT-SCHEDULE.md", "RULE-ASMT-FUTURE.md", "RULE-ASMT-AUTH.md"];
  const published = publishFragments(customer());
  assert.equal(published.documents.length, 1);
  for (const document of published.documents) {
    assert.equal(typeof document.htmlFragment, "string");
    for (const hidden of [...excluded, ...paths]) {
      assert.ok(!(document.htmlFragment ?? "").includes(hidden), `the fragment names ${hidden}`);
    }
  }
  // A body that links to an internal source is refused whole, so no fragment of it exists.
  const linking = publishFragments(customer(), guidance("See [the behavior](BEH-ASMT-SCHEDULE.md)."));
  assert.deepEqual(linking.documents, []);
  assert.ok(linking.diagnostics.some((d) => d.severity === "error"));
});

test("BEH-PUBLISH-FRAGMENT: a page and a fragment carry only http, https, mailto and scheme-less URLs", () => {
  for (const url of [
    "https://lantern.example/a",
    "HTTP://x",
    "mailto:a@lantern.example",
    "//lantern.example/protocol-relative",
    "/help",
    "#guidance",
    "a/b:c",
    "",
  ]) {
    assert.equal(safeUrl(url), true, url);
  }
  for (const url of [
    "javascript:alert(1)",
    " JaVaScript:alert(1)",
    "java\tscript:alert(1)",
    "\u0001javascript:x",
    "java\nscript:x",
    "vbscript:x",
    "data:text/html,x",
    "file:///etc/passwd",
    "tel:123",
  ]) {
    assert.equal(safeUrl(url), false, JSON.stringify(url));
  }
  const body = guidance(
    "[Open](javascript:alert(1)) ![logo](<java\tscript:x>) [ref][r] ![img][i] [ok](https://lantern.example/) [here](#guidance)\n\n" +
      "> [quoted](vbscript:x)\n\n[r]: JAVASCRIPT:x\n[i]: data:image/png,x",
  );
  const page = rendered(true, body).html ?? "";
  const fragment = rendered("fragment", body).htmlFragment ?? "";
  for (const html of [page, fragment]) {
    assert.doesNotMatch(html, /(href|src)="\s*(java|vbscript|data)/i, html);
    assert.ok(html.includes("<p>Open logo ref img "), html);
    assert.ok(html.includes('<a href="https://lantern.example/">ok</a> <a href="#guidance">here</a>'));
    assert.ok(html.includes("<p>quoted</p>"));
  }
  assert.ok(mainOf(page).endsWith(fragment));
  assert.equal(rendered(true).html, publishOnce().documents[0].html, "a document with no such URL is unchanged");
});

test("BEH-PUBLISH-FRAGMENT: a diagram the renderer draws stays a data:image/svg+xml image, its text escaped, in page and fragment", () => {
  // The URL rule is for URLs taken from the source; the renderer's own diagram image is kept on purpose.
  const body = guidance(
    ":::figure[The schedule]\n```ascii\n+--------------+\n| <script>     |\n+--------------+\n```\n:::",
  );
  const page = rendered(true, body).html ?? "";
  const fragment = rendered("fragment", body).htmlFragment ?? "";
  for (const html of [page, fragment]) {
    assert.match(html, /<img class="ms-diagram" data-diagram="ascii" src="data:image\/svg\+xml,%3Csvg/, html);
    assert.ok(html.includes("The schedule"), "the caption is the text alternative");
    assert.ok(!html.includes("<script"), "the fence's text is escaped inside the image");
  }
  assert.ok(mainOf(page).endsWith(fragment));
});

test("the index names the request without authorization and counts exclusions", () => {
  const result = publishOnce(customer({ visibility: "internal", authorizedInternal: true }));
  assert.deepEqual(Object.keys(result.index), ["profile", "request", "published", "excludedCounts", "keptUnderReview"]);
  assert.deepEqual(result.index.keptUnderReview, []);
  assert.equal(result.index.profile, "intentset/publication-index/0.3");
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

/** Every byte of a publication but the snapshot file: documents, pages, chunks, index and help file. */
function bytesOf(result: ReturnType<typeof publish>): string {
  return JSON.stringify([
    result.documents.map((document) => [document.markset, document.html ?? ""]),
    toChunks(result.documents),
    result.index,
    result.help,
    result.diagnostics,
  ]);
}

test("BEH-PUBLISH-READER: a role given as a string, a list of one or a list with a repeat publishes the same bytes", () => {
  const { graph, registries } = passing();
  const at = (role: unknown) =>
    bytesOf(
      publish(graph, registries, customer({ role }), {
        snapshot: snapshotOf(graph),
        publishedAt: PUBLISHED_AT,
        renderHtml: true,
      }),
    );
  const one = at("teacher");
  assert.equal(at(["teacher"]), one);
  assert.equal(at(["teacher", "teacher"]), one);
});

test("BEH-PUBLISH-READER: publicationMeta, keptPublicationMeta, generateDocument and helpFile read one audience or role as a list of one, never as its characters", () => {
  const { graph, registries } = passing();
  const raw = customer();
  assert.equal(typeof raw.audience, "string");
  assert.equal(typeof raw.role, "string");
  const { request } = checkRequest(raw, graph, registries);
  assert.ok(request !== null);
  const kb = graph.artifacts.get("KB-ASMT-SCHEDULE") as Artifact;
  const options = { publishedAt: PUBLISHED_AT };
  const entitlement = (meta: { audience: string[]; availability: { role: string[] } }) => [
    meta.audience,
    meta.availability.role,
  ];
  const expected = [["teacher"], ["teacher"]];
  assert.deepEqual(entitlement(publicationMeta(graph, kb, raw, options)), expected);
  assert.deepEqual(publicationMeta(graph, kb, raw, options), publicationMeta(graph, kb, request, options));
  const review = reviewStatus(graph, kb);
  assert.deepEqual(entitlement(keptPublicationMeta(graph, kb, raw, options, review)), expected);
  const fromRaw = generateDocument(graph, kb, raw, options).document;
  assert.ok(fromRaw !== null);
  assert.equal(fromRaw.markset, generateDocument(graph, kb, request, options).document?.markset);
  assert.deepEqual(entitlement(fromRaw.publication), expected);
  assert.deepEqual(entitlement(helpFile(graph, ["KB-ASMT-SCHEDULE"], raw, options)), expected);
  assert.deepEqual(
    helpFile(graph, ["KB-ASMT-SCHEDULE"], raw, options),
    helpFile(graph, ["KB-ASMT-SCHEDULE"], request, options),
  );
});

test("BEH-PUBLISH-READER: the index's request, with its authorization added back, publishes the same bytes", () => {
  const { graph, registries } = example({
    kb: reviewed(),
    registries: registriesWith({ roles: ["administrator", "teacher"], flags: ["beta"] }),
  });
  const options = { snapshot: snapshotOf(graph), publishedAt: PUBLISHED_AT, renderHtml: true as const };
  const first = publish(
    graph,
    registries,
    customer({ role: ["teacher", "administrator", "teacher"], audience: ["teacher"], flags: ["beta"] }),
    options,
  );
  assert.equal(first.ok, true);
  assert.deepEqual(first.index.request, {
    visibility: "customer",
    audience: ["teacher"],
    product: "PRD-LANTERN",
    release: "pilot-1",
    role: ["administrator", "teacher"],
    edition: "standard",
    flags: ["beta"],
  });
  const replay = publish(graph, registries, first.index.request as unknown as PublicationRequest, options);
  assert.equal(bytesOf(replay), bytesOf(first));
});

test("BEH-PUBLISH-READER: every document of a run names the same entitlement as its help file and index", () => {
  const classes = [
    "---",
    "markset: 0",
    "intentset:",
    "  spec: '0.4'",
    "  profile: intentset/knowledge/0.4",
    "  id: KB-ASMT-CLASSES",
    "  type: knowledge",
    "  title: Choose a class",
    "  status: approved",
    "  owner: team-assessment",
    "  visibility: customer",
    "  audiences: [product]",
    "  revision: 1",
    "  reviewedBy: team-assessment",
    "  reviewedAt: '2026-09-30'",
    "  links:",
    "    explains: [BEH-ASMT-SCHEDULE]",
    "  availability:",
    "    products: [PRD-LANTERN]",
    "    releases: [pilot-1]",
    "    roles: [administrator]",
    "    editions: [standard]",
    "    flags: []",
    "  review:",
    "    sources:",
    "      BEH-ASMT-SCHEDULE: '@current'",
    "      RULE-ASMT-AUTH: '@current'",
    "      RULE-ASMT-FUTURE: '@current'",
    "---",
    "",
    "# Choose a class",
    "",
    "## Guidance",
    "",
    "Choose the class first.",
    "",
  ].join("\n");
  const { graph, registries } = example({
    kb: reviewed(),
    files: { "KB-ASMT-CLASSES.md": classes },
    registries: registriesWith({ roles: ["administrator", "teacher"] }),
  });
  const result = publish(
    graph,
    registries,
    customer({ role: ["teacher", "administrator"], audience: ["teacher", "product"] }),
    {
      snapshot: snapshotOf(graph),
      publishedAt: PUBLISHED_AT,
    },
  );
  assert.deepEqual(
    result.documents.map((document) => document.id),
    ["KB-ASMT-CLASSES", "KB-ASMT-SCHEDULE"],
  );
  const help = result.help as NonNullable<typeof result.help>;
  for (const document of result.documents) {
    assert.deepEqual(document.publication.audience, help.audience, document.id);
    assert.deepEqual(document.publication.availability, help.availability, document.id);
  }
  assert.deepEqual(help.audience, ["product", "teacher"]);
  assert.deepEqual(help.availability.role, ["administrator", "teacher"]);
  assert.deepEqual(result.index.request?.audience, help.audience);
  assert.deepEqual(result.index.request?.role, help.availability.role);
});

test("BEH-PUBLISH-READER: a document refused for its Markset lends no title to another document's body", () => {
  // KB-ASMT-ACCEPT shares its title with the internal SCN-ASMT-SCHEDULE and is refused for an unknown directive, so
  // the title in KB-ASMT-SCHEDULE's body is no longer allowed (publication §4).
  const accept = [
    "---",
    "markset: 0",
    "intentset:",
    "  spec: '0.4'",
    "  profile: intentset/knowledge/0.4",
    "  id: KB-ASMT-ACCEPT",
    "  type: knowledge",
    "  title: Accept an eligible schedule",
    "  status: approved",
    "  owner: team-assessment",
    "  visibility: customer",
    "  audiences: [teacher]",
    "  revision: 1",
    "  reviewedBy: team-assessment",
    "  reviewedAt: '2026-09-30'",
    "  links:",
    "    explains: [BEH-ASMT-SCHEDULE]",
    "  availability:",
    "    products: [PRD-LANTERN]",
    "    releases: [pilot-1]",
    "    roles: [teacher]",
    "    editions: [standard]",
    "    flags: []",
    "  review:",
    "    sources:",
    "      BEH-ASMT-SCHEDULE: '@current'",
    "      RULE-ASMT-AUTH: '@current'",
    "      RULE-ASMT-FUTURE: '@current'",
    "---",
    "",
    "# Accept an eligible schedule",
    "",
    "## Guidance",
    "",
    ":::behavior",
    "Check the class.",
    ":::",
    "",
  ].join("\n");
  const { graph, registries } = example({
    kb: reviewed(),
    body: guidance("Choose a published assessment. Accept an eligible schedule before you confirm."),
    files: { "KB-ASMT-ACCEPT.md": accept },
  });
  const result = publish(graph, registries, customer(), { snapshot: snapshotOf(graph), publishedAt: PUBLISHED_AT });
  assert.deepEqual(result.index.published, []);
  assert.deepEqual(
    result.diagnostics.map((d) => `${d.code} ${d.artifact}`),
    ["PUB004 KB-ASMT-ACCEPT", "PUB002 KB-ASMT-SCHEDULE"],
  );
  assert.deepEqual(result.index.excludedCounts, { directive: 1, title: 1 });
});
