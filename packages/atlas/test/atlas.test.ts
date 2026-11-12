import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { test } from "node:test";
import {
  type Diagnostic,
  parseYaml,
  type DocumentInput,
  graphHash,
  type Level,
  plainCarrier,
  readRegistries,
  validate,
} from "@intentset/core";
import { classifyEvidence, coverage, type RunRecord } from "@intentset/verification";
import { parseDocument } from "@markset-lang/parser";
import { defaultStylesheetPath } from "@markset-lang/render-html";
import {
  type AtlasInput,
  type AtlasMapLayout,
  atlasMapLayout,
  buildAtlas,
  buildAtlasPages,
  buildAtlasSources,
} from "../src/index.ts";
import { barRowHeight, middle } from "../src/chart.ts";
import { chartLabel } from "../src/pages/overview.ts";
import { largeModel } from "./large-model.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const dir = join(root, "examples", "scheduling");
const registries = readRegistries(
  readFileSync(join(dir, "registries.yaml"), "utf8"),
  "examples/scheduling/registries.yaml",
).registries;
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => ({ name, source: readFileSync(join(dir, name), "utf8") }));

const COMMIT = "abcdef0123456789abcdef0123456789abcdef01";
const OLD_HASH = "0".repeat(64);
const SCOPE = ["examples/scheduling/**"];

interface Options {
  edit?: (name: string, source: string) => string;
  reverse?: boolean;
  commit?: string | null;
  level?: Level;
  runs?: (hash: string) => RunRecord[];
}

/** The example validated, as the CLI would hand it to the Atlas, with evidence classified from `runs` when given. */
function example(options: Options = {}): AtlasInput {
  const inputs: DocumentInput[] = files.map(({ name, source }) =>
    plainCarrier(`examples/scheduling/${name}`, options.edit?.(name, source) ?? source),
  );
  if (options.reverse) inputs.reverse();
  const level = options.level ?? "L1";
  const result = validate(inputs, registries, { level });
  const hash = graphHash(result.graph);
  const commit = options.commit === undefined ? null : options.commit;
  let evidence: AtlasInput["evidence"] = null;
  if (options.runs !== undefined) {
    const classification = classifyEvidence(result.graph, options.runs(hash), {
      commit,
      graphHash: hash,
      scope: { product: "PRD-LANTERN", release: "pilot-1" },
    });
    evidence = { classification, coverage: coverage(result.graph, classification, { level }) };
  }
  return {
    graph: result.graph,
    registries,
    diagnostics: result.diagnostics,
    snapshot: { commit, graphHash: hash, scope: SCOPE, level },
    evidence,
  };
}

/** A manual review of the example's one verification definition. */
function review(hash: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    evidenceId: "EV-REVIEW-001",
    verificationId: "TEST-ASMT-SCHEDULE",
    commit: COMMIT,
    graphHash: hash,
    environment: "pilot",
    scope: { product: "PRD-LANTERN", release: "pilot-1" },
    tool: null,
    reviewer: "reviewer-ana",
    startedAt: "2026-09-30T09:00:00Z",
    finishedAt: "2026-09-30T09:45:00Z",
    result: "pass",
    uri: "https://evidence.example/lantern/review",
    rationale: "Ran the procedure and observed the expected result.",
    ...overrides,
  };
}

/** Visible text of a page: inline tags dropped, block tags made spaces, entities for the five escaped characters decoded, whitespace folded. */
function textOf(html: string): string {
  return html
    .replace(/<\/?(?:a|code|em|span|strong)\b[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function pages(atlas: Map<string, string>): [string, string][] {
  return [...atlas].filter(([path]) => path.endsWith(".html"));
}

const PAGES = [
  "index.html",
  "records.html",
  "ownership.html",
  "verification.html",
  "publication.html",
  "diagnostics.html",
  "map.html",
  ...files.map(({ name }) => `records/${name.replace(/\.md$/, ".html")}`),
  "atlas.css",
  "atlas-map.js",
];

test("BEH-ATLAS: the Atlas of the example has the seven pages, a page per record, and the stylesheet once", () => {
  const atlas = buildAtlas(example());
  assert.deepEqual([...atlas.keys()], PAGES);
  assert.ok(
    atlas.get("atlas.css")?.startsWith(readFileSync(defaultStylesheetPath, "utf8")),
    "Markset's stylesheet, then the Atlas's few additions",
  );
  for (const [path, html] of pages(atlas)) {
    const href = `${"../".repeat(path.split("/").length - 1)}atlas.css`;
    assert.ok(html.includes(`<link rel="stylesheet" href="${href}">`), path);
  }
});

test("no page but the map carries a script, and the map loads only its own, after main (ADR 0015)", () => {
  for (const input of [example(), example({ runs: (hash) => [review(hash)] })]) {
    for (const [path, html] of pages(buildAtlas(input))) {
      if (path !== "map.html") {
        assert.ok(!/<script/i.test(html), path);
        continue;
      }
      assert.deepEqual(
        [...html.matchAll(/<script[^>]*>/gi)].map((m) => m[0]),
        ['<script src="atlas-map.js" defer>'],
      );
      assert.ok(html.indexOf("<script") > html.indexOf("</main>"), "after main");
    }
  }
});

test("every internal link resolves to a page in the Atlas, and every fragment to an id on it", () => {
  const atlas = buildAtlas(example({ runs: (hash) => [review(hash)] }));
  let checked = 0;
  for (const [path, html] of pages(atlas)) {
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
      if (/^[a-z]+:/i.test(href)) continue;
      const [file, fragment] = href.split("#");
      const target = file === "" ? path : posix.normalize(posix.join(posix.dirname(path), file));
      assert.ok(atlas.has(target), `${path} links to ${href}, which is not in the Atlas`);
      if (fragment !== undefined) {
        assert.ok(atlas.get(target)?.includes(`id="${fragment}"`), `${path} links to ${href}, which has no such id`);
      }
      checked++;
    }
  }
  assert.ok(checked > 40, `only ${checked} links checked`);
});

test("BEH-ATLAS: every page states the snapshot and the internal banner", () => {
  const unknown = example();
  const prefix = unknown.snapshot.graphHash.slice(0, 12);
  for (const [path, html] of pages(buildAtlas(unknown))) {
    const text = textOf(html);
    assert.ok(
      text.includes(`Snapshot: commit unknown · graph hash ${prefix} · level L1 · scope examples/scheduling/**`),
      path,
    );
    assert.ok(text.includes("Internal: not for publication"), path);
    assert.ok(html.includes('<meta name="intentset-atlas" content="'), path);
  }
  const known = example({ commit: COMMIT, level: "L2" });
  for (const [path, html] of pages(buildAtlas(known))) {
    assert.ok(textOf(html).includes(`Snapshot: commit ${COMMIT.slice(0, 12)} · graph hash ${prefix} · level L2`), path);
  }
});

test("BEH-ATLAS: an invented example's Atlas says so on every page instead of the internal banner", () => {
  const input = example();
  for (const built of [buildAtlas(input, { notice: "example" }), buildAtlasSources(input, { notice: "example" })]) {
    let checked = 0;
    for (const [path, page] of built) {
      if (!path.endsWith(".html")) continue;
      assert.ok(page.includes("An invented example"), path);
      assert.ok(page.includes("stays inside the organization"), path);
      assert.ok(!page.includes("Internal: not for publication"), path);
      checked++;
    }
    assert.ok(checked > 5, `only ${checked} pages`);
  }
  // The default stays internal.
  for (const [path, source] of buildAtlasSources(input)) {
    assert.ok(source.includes("Internal: not for publication"), path);
  }
});

test("BEH-ATLAS: the layout is Markset's: the record's text first, the context bundle as a grid of cards, coverage drawn as charts", () => {
  const input = example({ runs: (hash) => [review(hash)] });
  const atlas = buildAtlas(input);
  const behavior = atlas.get("records/BEH-ASMT-SCHEDULE.html") ?? "";
  assert.match(behavior, /<div class="ms-grid" data-cols="3"/);
  assert.ok(
    (behavior.match(/class="ms-grid-item">\s*<section class="ms-card/g) ?? []).length >= 4,
    "one card per role",
  );
  assert.match(
    behavior,
    /<h2 id="the-record">The record<\/h2>\s*<section class="ms-card record"[\s\S]*?<\/table>\s*<h3>Behavior<\/h3>\s*<p>A teacher submits[\s\S]*?<\/section>\s*<p class="derived">[\s\S]*<h2 id="context-bundle">/,
    "the record in one card, its fields then its text with its sections a level down, before what the Atlas derives",
  );
  assert.doesNotMatch(behavior, /<details/, "nothing is folded away");
  // A chart is drawn in front of its table, and the table stays on the page.
  const verification = atlas.get("verification.html") ?? "";
  assert.match(verification, /<svg class="ms-chart" data-chart="bar"[\s\S]*?<table>/);
  for (const [path, html] of pages(atlas)) if (path !== "map.html") assert.doesNotMatch(html, /<script/i, path);
});

test("BEH-ATLAS: every record has a page that opens with its text, rendered, before anything the Atlas derives", () => {
  const atlas = buildAtlas(example());
  for (const { name, source } of files) {
    const id = name.replace(/\.md$/, "");
    const page = atlas.get(`records/${id}.html`) ?? "";
    const body = source.slice(source.indexOf("\n---\n", 4) + 5);
    // The first sentence of the record's first section, as a reader sees it.
    const sentence = (body.split(/\n## [^\n]+\n/)[1] ?? "")
      .trim()
      .split(/(?<=\.)\s/)[0]
      .replace(/\s+/g, " ");
    assert.ok(sentence.length > 20, `${id}: nothing to compare`);
    const text = textOf(page);
    const at = text.indexOf(sentence);
    assert.ok(at > text.indexOf("The record"), `${id}: its text is on its page, under The record`);
    for (const derived of ["Context bundle", "Links"]) {
      if (text.includes(derived)) assert.ok(at < text.indexOf(derived), `${id}: its text comes before ${derived}`);
    }
    assert.doesNotMatch(page, /<details/, `${id}: nothing is folded away`);
    assert.equal((page.match(/<h1[\s>]/g) ?? []).length, 1, `${id}: its own title heading is dropped`);
  }
});

test("BEH-ATLAS: Records lists every record by type, and every record ID on the review pages links to its page", () => {
  const atlas = buildAtlas(example());
  const records = atlas.get("records.html") ?? "";
  for (const { name } of files) {
    const id = name.replace(/\.md$/, "");
    assert.ok(records.includes(`<a href="records/${id}.html"><code>${id}</code></a>`), `Records lists ${id}`);
  }
  assert.match(textOf(records), /Products \(1\).*Behaviors \(1\).*Rules \(2\).*Verifications \(1\).*Decisions \(1\)/);
  for (const page of ["index.html", "ownership.html", "verification.html", "publication.html", "records.html"]) {
    assert.ok(atlas.get(page)?.includes('<a href="records.html"'), `${page}: Records is in the navigation`);
  }
  // A rule, a verification, a slice and a knowledge record were IDs without a page, or anchors on a review page.
  const verification = atlas.get("verification.html") ?? "";
  assert.ok(verification.includes('<a href="records/RULE-ASMT-AUTH.html"><code>RULE-ASMT-AUTH</code></a>'));
  assert.ok(verification.includes('<a href="records/TEST-ASMT-SCHEDULE.html"><code>TEST-ASMT-SCHEDULE</code></a>'));
  assert.ok(atlas.get("index.html")?.includes('<a href="records/SLICE-ASMT-SCHEDULE.html">'));
  assert.ok(atlas.get("publication.html")?.includes('<a href="records/BEH-ASMT-SCHEDULE.html">'));
  for (const path of ["index.html", "ownership.html", "verification.html", "publication.html", "diagnostics.html"]) {
    const html = atlas.get(path) ?? "";
    assert.doesNotMatch(html, /href="[^"#]+#[A-Z][A-Z0-9]*-/, `${path}: a record ID links its page, not an anchor`);
  }
});

/** The record's card on its page: its path, its fields and its text, as a reader sees them. */
function card(page: string): string {
  const start = page.indexOf('<section class="ms-card record"');
  assert.ok(start > 0, "the page has the record's card");
  return page.slice(start, page.indexOf("</section>", start));
}

test("BEH-ATLAS: a record's card holds every value its frontmatter writes, and nothing derived", () => {
  const atlas = buildAtlas(example());
  // Every value, and the keys of the maps a record keys by its own data (tips and extensions by ID, layers by name).
  const leaves = (value: unknown, keyed = false): string[] =>
    Array.isArray(value)
      ? value.flatMap((v) => leaves(v, keyed))
      : value !== null && typeof value === "object"
        ? Object.entries(value).flatMap(([key, inner]) => [
            ...(keyed ? [key] : []),
            ...leaves(inner, keyed || key === "layers"),
          ])
        : [String(value)];
  for (const { name, source } of files) {
    const id = name.replace(/\.md$/, "");
    const yaml = parseYaml(source.slice(4, source.indexOf("\n---\n", 4)));
    const block = (yaml.value?.intentset ?? {}) as Record<string, unknown>;
    const read = textOf(card(atlas.get(`records/${id}.html`) ?? ""));
    for (const [key, value] of Object.entries(block)) {
      for (const leaf of leaves(value, key === "tips" || key === "extensions")) {
        assert.ok(read.includes(leaf), `${id}: ${key} ${leaf} is in its card`);
      }
    }
    assert.ok(read.includes(`examples/scheduling/${name}`), `${id}: the card names its file`);
    assert.ok(!read.includes("derived"), `${id}: nothing derived is in the card`);
  }
});

test("BEH-ATLAS: a record's page links its file where a source address is given, and names the path either way", () => {
  const without = buildAtlas(example()).get("records/RULE-ASMT-AUTH.html") ?? "";
  assert.ok(card(without).includes("<code>examples/scheduling/RULE-ASMT-AUTH.md</code>"));
  assert.doesNotMatch(without, /View the file/);
  const github = buildAtlas(example(), { source: (path) => `https://github.example/repo/blob/main/${path}` });
  assert.ok(
    card(github.get("records/RULE-ASMT-AUTH.html") ?? "").includes(
      '<a href="https://github.example/repo/blob/main/examples/scheduling/RULE-ASMT-AUTH.md">View the file on GitHub</a>',
    ),
  );
});

test("BEH-ATLAS: a record's page says where it sits, keeps Records marked, and lists the records that link to it", () => {
  const atlas = buildAtlas(example());
  const rule = atlas.get("records/RULE-ASMT-AUTH.html") ?? "";
  assert.ok(rule.includes('<a href="../records.html" aria-current="page">Records</a>'), "Records is marked");
  assert.ok(textOf(rule).includes("Records › Rules › RULE-ASMT-AUTH"));
  assert.ok(atlas.get("records.html")?.includes('id="rule"'), "the breadcrumb's anchor is on Records");
  assert.ok(textOf(rule).includes("Governs: BEH-ASMT-SCHEDULE Schedule a student assessment"));
  assert.ok(textOf(rule).includes("Verified by: TEST-ASMT-SCHEDULE"));
  const behavior = textOf(atlas.get("records/BEH-ASMT-SCHEDULE.html") ?? "");
  assert.ok(
    behavior.includes("In the model: PRD-LANTERN › INT-PREPARE › OUT-PREPARE › CAP-ASMT-ASSIGN › BEH-ASMT-SCHEDULE"),
  );
  const knowledge = textOf(atlas.get("records/KB-ASMT-SCHEDULE.html") ?? "");
  assert.ok(knowledge.includes("Review: review current reviewed by team-assessment"));
  const slice = atlas.get("records/SLICE-ASMT-SCHEDULE.html") ?? "";
  assert.ok(slice.includes('href="../ownership.html#SLICE-ASMT-SCHEDULE"'), "a slice's page leads to its ownership");
});

test("BEH-ATLAS: in a record's text, a safe link stays, a link to another record's file leads to its page, an ID in code links it, and anything else keeps only its words", () => {
  const input = example({
    edit: (name, source) =>
      name === "RULE-ASMT-AUTH.md"
        ? `${source}\nSee [the rule](RULE-ASMT-FUTURE.md#constraint), \`BEH-ASMT-SCHEDULE\`, [the docs](https://example.com/docs), ` +
          "[a script](javascript:alert(1)), [a file](../../README.md) and ![a picture](diagram.png).\n"
        : source,
  });
  const page = buildAtlas(input).get("records/RULE-ASMT-AUTH.html") ?? "";
  assert.ok(page.includes('<a href="RULE-ASMT-FUTURE.html">the rule</a>'));
  assert.ok(page.includes('<a href="BEH-ASMT-SCHEDULE.html"><code>BEH-ASMT-SCHEDULE</code></a>'));
  assert.ok(page.includes('<a href="https://example.com/docs">the docs</a>'));
  assert.doesNotMatch(page, /javascript:|README\.md|diagram\.png|<img/);
  assert.ok(textOf(page).includes("a script, a file and a picture."));

  // The site serves the pages at addresses of its own, and says where the record's text links lead.
  const site = buildAtlasPages(input, { link: (from, to) => `/site/${to}?from=${from}` });
  const html = site.find((p) => p.path === "records/RULE-ASMT-AUTH.html")?.html ?? "";
  assert.ok(
    html.includes('<a href="/site/records/RULE-ASMT-FUTURE.html?from=records/RULE-ASMT-AUTH.html">the rule</a>'),
  );
  assert.equal(site.find((p) => p.path === "map.html")?.html, undefined, "the map's HTML is mapHtml's");
});

test("BEH-ATLAS: a record's text that does not parse as Markset is shown as written, and the page says so", () => {
  const input = example({
    edit: (name, source) => (name === "SCN-ASMT-SCHEDULE.md" ? `${source}\n:::nope\nunclosed\n` : source),
  });
  const page = textOf(buildAtlas(input).get("records/SCN-ASMT-SCHEDULE.html") ?? "");
  assert.ok(page.includes("Text shown as written"));
  assert.ok(page.includes("does not parse as Markset (DIRECTIVE_UNKNOWN_NAME)"));
  assert.ok(page.includes(":::nope unclosed"));
});

test("a capability's chart label drops CAP-, keeps up to forty characters whole and cuts a longer one in the middle", () => {
  assert.equal(chartLabel("CAP-ASK"), "ASK");
  assert.equal(chartLabel("CAP-LEARN-FROM-QUESTIONS"), "LEARN-FROM-QUESTIONS");
  assert.equal(chartLabel("OTHER-ID"), "OTHER-ID");
  const long = chartLabel("CAP-CONTENT-GENERATION-WITH-A-VERY-LONG-NAME-INDEED-ONE");
  assert.equal(long.length, 40);
  assert.ok(long.startsWith("CONTENT-GENERATION") && long.endsWith("INDEED-ONE".slice(-6)) && long.includes("…"), long);
  // Two IDs alike for their first thirty characters still differ after the cut, because the end is kept.
  assert.notEqual(
    chartLabel("CAP-CONTENT-GENERATION-WITH-A-VERY-LONG-NAME-ALPHA"),
    chartLabel("CAP-CONTENT-GENERATION-WITH-A-VERY-LONG-NAME-OMEGA"),
  );
  assert.equal(middle("ABCDEFGHIJ", 10), "ABCDEFGHIJ");
});

/** The overview's chart SVG: its viewBox height and the category labels it draws, in order. */
function overviewChart(html: string) {
  const svg = html.match(/<svg class="ms-chart" data-chart="bar" viewBox="0 0 (\d+) (\d+)"[\s\S]*?<\/svg>/);
  assert.ok(svg, "the overview draws a bar chart");
  const labels = [
    ...svg[0].matchAll(/<text class="ms-chart-tick" x="[\d.]+" y="[\d.]+" text-anchor="end">([^<]*)<\/text>/g),
  ].map((m) => m[1]);
  const bars = [...svg[0].matchAll(/<path class="ms-chart-bar" data-series="(\d)" d="M[\d.]+,([\d.]+)h[^"]*"/g)].map(
    (m) => ({
      series: Number(m[1]),
      y: Number(m[2]),
    }),
  );
  return { width: Number(svg[1]), height: Number(svg[2]), labels, bars };
}

test("BEH-ATLAS: the overview's chart stays readable at any number of capabilities: a row each, whole labels, bars you can see", () => {
  // A few capabilities: the same 340-unit figure Markset's own engine draws.
  const few = overviewChart(buildAtlas(largeModel(4, 2).input).get("index.html") ?? "");
  assert.equal(few.height, 340);
  // 45 capabilities with long, alike IDs: the figure grows, every label is there whole and distinct, no two rows are
  // closer than a line of type, and a bar is at least eight units thick.
  const model = largeModel(45, 4);
  const chart = overviewChart(buildAtlas(model.input).get("index.html") ?? "");
  assert.equal(chart.labels.length, 45);
  assert.equal(new Set(chart.labels).size, 45, "every label differs from the others");
  assert.deepEqual(
    chart.labels,
    model.capabilities.map((id) => id.replace(/^CAP-/, "")),
    "every label whole, in order",
  );
  const rows = chart.bars.filter((bar) => bar.series === 1).map((bar) => bar.y);
  assert.equal(rows.length, 45);
  const pitch = (rows[44] - rows[0]) / 44;
  assert.ok(pitch >= 20, `a row is ${pitch} units tall, room for its 12-unit label`);
  assert.ok(chart.height >= 45 * 20, `the figure grows to ${chart.height}`);
  assert.equal(barRowHeight(45, 2), 26);
  // And a hundred, still one row each.
  assert.equal(overviewChart(buildAtlas(largeModel(100, 1).input).get("index.html") ?? "").labels.length, 100);
});

test("BEH-ATLAS-MAP: every record is a node and every authored link an edge, drawn once", () => {
  const input = example();
  const map = buildAtlas(input).get("map.html") ?? "";
  const nodes = [...map.matchAll(/class="am-node" data-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(nodes, [...input.graph.artifacts.keys()].sort());
  const edges = [...map.matchAll(/<line class="am-edge" data-from="([^"]+)" data-to="([^"]+)"/g)].map(
    (m) => `${m[1]}>${m[2]}`,
  );
  const authored = new Set(
    input.graph.edges
      .filter((e) => input.graph.artifacts.has(e.from) && input.graph.artifacts.has(e.to) && e.from !== e.to)
      .map((e) => `${e.from}>${e.to}`),
  );
  for (const edge of authored) assert.ok(edges.includes(edge), `${edge} is drawn`);
  for (const edge of edges) assert.ok(authored.has(edge), `${edge} is authored`);
  assert.ok(edges.length >= 10, `only ${edges.length} edges`);
  assert.doesNotMatch(map, /NaN|Infinity/, "every coordinate is a number");
  // The picture stands without the script: the controls are hidden until it runs, and every record with a page links it.
  assert.match(map, /<div class="am-controls" hidden>/);
  assert.match(map, /<a class="am-node" data-id="BEH-ASMT-SCHEDULE"[^>]* href="records\/BEH-ASMT-SCHEDULE.html"/);
  assert.match(map, /<a class="am-node" data-id="RULE-ASMT-AUTH"[^>]* href="records\/RULE-ASMT-AUTH.html"/);
  assert.doesNotMatch(map, /<g class="am-node"/, "every record has a page, so every node is a link");
});

test("BEH-ATLAS-MAP: the same graph gives the same map, whatever order its files are read in", () => {
  const once = buildAtlas(example()).get("map.html");
  assert.equal(buildAtlas(example()).get("map.html"), once);
  assert.equal(buildAtlas(example({ reverse: true })).get("map.html"), once);
});

test("BEH-ATLAS-MAP: the map comes first, after one sentence, and how to read and use it follows the picture", () => {
  for (const notice of ["internal", "example"] as const) {
    const map = buildAtlas(example(), { notice }).get("map.html") ?? "";
    const main = map.slice(map.indexOf("<main"), map.indexOf("</main>"));
    const lead = main.indexOf('<p class="lead">');
    const controls = main.indexOf('<div class="am-map">');
    const svg = main.indexOf('<svg class="am-svg');
    const reading = main.indexOf("Reading the map</h2>");
    const using = main.indexOf("Using the map</h2>");
    assert.ok(lead > 0 && lead < controls && controls < svg && svg < reading && reading < using, notice);
    // Between the lead sentence and the map, nothing: the lead is one sentence, and the slot is filled, not left as a rule.
    assert.equal(main.slice(main.indexOf("</p>", lead) + 4, controls).trim(), "");
    assert.equal((main.slice(lead, main.indexOf("</p>", lead)).match(/\. /g) ?? []).length, 0, "one sentence");
    assert.doesNotMatch(main, /<hr class="am-slot">/);
    for (const words of ["Color", "A dashed outline", "verification's ring", "Find a record by its ID"]) {
      assert.ok(main.indexOf(words, svg) > svg, `${words} is below the map`);
    }
  }
  // The source alone keeps a rule where the map stands, so it still reads in order without the Atlas's shell.
  const source = buildAtlasSources(example()).get("map.html") ?? "";
  assert.match(source, /\{\.am-slot\}\n\*\*\*\n/);
});

/** Every node's circle and label as boxes, read back from the drawing; a label is about six units a character. */
function footprints(layout: AtlasMapLayout) {
  return layout.nodes.map((node) => ({
    id: node.id,
    circle: { left: node.x - node.r, right: node.x + node.r, top: node.y - node.r, bottom: node.y + node.r },
    label: {
      left: node.x + node.r + 3,
      right: node.x + node.r + 3 + node.id.length * 6,
      top: node.y - 4.5,
      bottom: node.y + 4.5,
    },
  }));
}
type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** A crowded graph with long IDs: clusters of behaviors around capabilities, each with rules and a check. */
function crowded(n: number): AtlasInput {
  const artifacts = new Map();
  const edges: { kind: string; from: string; to: string }[] = [];
  const add = (id: string, type: string) =>
    artifacts.set(id, { meta: { id, type, title: id, status: "draft" }, path: `${id}.md` });
  for (let c = 0; c < n / 10; c++) {
    const cap = `CAP-CLUSTER-${c}`;
    add(cap, "capability");
    for (let b = 0; b < 3; b++) {
      const beh = `BEH-CLUSTER-${c}-BEHAVIOR-${b}`;
      add(beh, "behavior");
      edges.push({ kind: "realizes", from: beh, to: cap });
      const rule = `RULE-CLUSTER-${c}-${b}`;
      add(rule, "rule");
      edges.push({ kind: "governedBy", from: beh, to: rule });
      const check = `TEST-CLUSTER-${c}-${b}`;
      add(check, "verification");
      edges.push({ kind: "verifies", from: check, to: beh });
    }
  }
  const graph = { artifacts, edges, derived: [], out: new Map(), in: new Map() };
  return {
    graph,
    registries: {},
    diagnostics: [],
    snapshot: { commit: null, graphHash: "", scope: [], level: "L1" },
    evidence: null,
  } as unknown as AtlasInput;
}

test("BEH-ATLAS-MAP: no label overlaps another record's label or circle, and the box fits the drawing", () => {
  for (const [name, input] of [
    ["the example", example()],
    ["a crowded graph", crowded(100)],
  ] as const) {
    const layout = atlasMapLayout(input);
    assert.ok(layout.nodes.length <= 120, `${name}: labels show, so they must not overlap`);
    const prints = footprints(layout);
    for (const [i, a] of prints.entries()) {
      for (const b of prints.slice(i + 1)) {
        assert.ok(!overlaps(a.label, b.label), `${name}: ${a.id}'s label overlaps ${b.id}'s`);
        assert.ok(!overlaps(a.label, b.circle), `${name}: ${a.id}'s label covers ${b.id}`);
        assert.ok(!overlaps(b.label, a.circle), `${name}: ${b.id}'s label covers ${a.id}`);
        assert.ok(!overlaps(a.circle, b.circle), `${name}: ${a.id} and ${b.id} overlap`);
      }
    }
    // The box holds every circle and label, with no more than a small margin on any side.
    const [x, y, w, h] = layout.box;
    const left = Math.min(...prints.map((p) => p.circle.left));
    const right = Math.max(...prints.map((p) => p.label.right));
    const top = Math.min(...prints.map((p) => Math.min(p.circle.top, p.label.top)));
    const bottom = Math.max(...prints.map((p) => Math.max(p.circle.bottom, p.label.bottom)));
    for (const [side, slack] of [
      ["left", left - x],
      ["right", x + w - right],
      ["top", top - y],
      ["bottom", y + h - bottom],
    ] as const) {
      assert.ok(slack >= 0 && slack <= 24, `${name}: ${side} margin ${slack}`);
    }
    // The same graph, the same bytes: the separation is part of the deterministic layout.
    assert.deepEqual(atlasMapLayout(input), layout);
  }
});

test("BEH-ATLAS-MAP: a verification's ring is green only for a current pass, and its status is in its title", () => {
  const ring = (map: string) =>
    /data-id="TEST-ASMT-SCHEDULE"[^>]*data-evidence="([^"]+)" data-tone="([^"]+)"/.exec(map);
  const none = ring(buildAtlas(example()).get("map.html") ?? "");
  assert.deepEqual(none?.slice(1), ["not assessed", "neutral"]);
  const passed = ring(buildAtlas(example({ runs: (hash) => [review(hash)] })).get("map.html") ?? "");
  assert.deepEqual(passed?.slice(1), ["current pass", "success"]);
  const failed = ring(
    buildAtlas(example({ runs: (hash) => [review(hash, { result: "fail" })] })).get("map.html") ?? "",
  );
  assert.notEqual(failed?.[2], "success");
  assert.match(
    buildAtlas(example()).get("map.html") ?? "",
    /<title>TEST-ASMT-SCHEDULE: [^<]*evidence not assessed\)<\/title>/,
  );
});

test("BEH-ATLAS-MAP: the script writes text, never markup, and asks for nothing", () => {
  const script = buildAtlas(example()).get("atlas-map.js") ?? "";
  assert.ok(script.length > 1000);
  assert.doesNotMatch(
    script,
    /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|localStorage|sessionStorage|import\(/,
  );
});

test("every page is Markset version 0 with the derived atlas block, and parses without a diagnostic", () => {
  for (const input of [example(), example({ runs: (hash) => [review(hash, { result: "fail" })] })]) {
    for (const [path, source] of buildAtlasSources(input)) {
      const parsed = parseDocument(source);
      assert.deepEqual(parsed.diagnostics, [], path);
      assert.equal(parsed.frontmatter?.markset, 0, path);
      assert.match(
        source,
        /\nintentset-atlas:\n {2}profile: intentset\/atlas\/0\.2\n {2}derived: true\n {2}snapshot:\n/,
        path,
      );
      assert.ok(!/^intentset:/m.test(source), `${path} must never read as a canonical record`);
    }
  }
});

test("without evidence the Atlas says so, shows link coverage only, and counts nothing as verified", () => {
  const atlas = buildAtlas(example());
  const verification = textOf(atlas.get("verification.html") as string);
  assert.ok(verification.includes("No run evidence supplied"));
  assert.ok(verification.includes("Linked by any definition 1 of 1 2 of 2 1 of 1 links"));
  assert.ok(verification.includes("Verified at this snapshot not assessed"));
  assert.ok(!verification.includes("current pass 1 of"));
  assert.ok(textOf(atlas.get("index.html") as string).includes("No run evidence supplied"));
  const behavior = textOf(atlas.get("records/BEH-ASMT-SCHEDULE.html") as string);
  assert.ok(behavior.includes("Verified: not assessed, because no run evidence was supplied."));
});

test("a pass recorded against another graph hash reads as stale, in words, and verifies nothing", () => {
  const atlas = buildAtlas(example({ commit: COMMIT, runs: () => [review(OLD_HASH)] }));
  const verification = textOf(atlas.get("verification.html") as string);
  assert.ok(!verification.includes("No run evidence supplied"));
  assert.ok(verification.includes("stale 1 of 1 verification definition"));
  assert.ok(verification.includes("current pass 0 of 1 verification definition"));
  assert.ok(verification.includes("Verified at this snapshot 0 of 1 0 of 2 0 of 1 evidence"));
  const behavior = textOf(atlas.get("records/BEH-ASMT-SCHEDULE.html") as string);
  assert.ok(behavior.includes("stale"));
  assert.ok(behavior.includes(`EV-REVIEW-001 pass, finished 2026-09-30T09:45:00Z, at commit ${COMMIT.slice(0, 12)}`));
  assert.ok(behavior.includes("Verified at this snapshot: 0 of 4 claims (evidence)."));
});

test("a current pass verifies every claim it names, and a failing run stays visible", () => {
  const passing = buildAtlas(example({ commit: COMMIT, runs: (hash) => [review(hash)] }));
  const verification = textOf(passing.get("verification.html") as string);
  assert.ok(verification.includes("current pass 1 of 1 verification definition"));
  assert.ok(verification.includes("Verified at this snapshot 1 of 1 2 of 2 1 of 1 evidence"));
  assert.ok(
    textOf(passing.get("index.html") as string).includes(
      "Behaviors with current passing evidence 1 of 1 of behaviors; evidence at this snapshot",
    ),
  );

  const failing = buildAtlas(
    example({
      commit: COMMIT,
      runs: (hash) => [
        review(hash),
        review(hash, { evidenceId: "EV-REVIEW-002", finishedAt: "2026-09-30T10:00:00Z", result: "fail" }),
      ],
    }),
  );
  const text = textOf(failing.get("verification.html") as string);
  assert.ok(text.includes("failing 1 of 1 verification definition"));
  assert.ok(text.includes("at this snapshot 1 pass, 1 fail, 0 skip, 0 error"));
});

test("every status word is on the verification page in text, with or without evidence", () => {
  for (const input of [example(), example({ runs: (hash) => [review(hash)] })]) {
    const text = textOf(buildAtlas(input).get("verification.html") as string);
    for (const word of ["current pass", "failing", "stale", "skipped", "error", "missing", "unresolved"]) {
      assert.ok(text.includes(`${word} `), word);
    }
  }
});

test("no count is a percentage: a percent sign is only ever a record's own words, such as a measure's target", () => {
  const input = example({ runs: (hash) => [review(hash)] });
  const targets = [...input.graph.artifacts.values()].flatMap((a) => a.meta.measure?.target ?? []);
  assert.ok(
    targets.some((target) => target.includes("%")),
    "the example has a target to except",
  );
  for (const [path, html] of pages(buildAtlas(input))) {
    const derived = targets.reduce((page, target) => page.replaceAll(target, ""), textOf(html));
    assert.ok(!/\d\s*%/.test(derived), path);
  }
});

test("publication readiness runs the projection per visibility with the knowledge's own availability", () => {
  // The example's knowledge is approved and reviewed against its sources as they are.
  const approved = textOf(buildAtlas(example()).get("publication.html") as string);
  assert.ok(approved.includes("public public excluded visibility"));
  assert.ok(approved.includes("customer public, customer would publish"));
  assert.ok(approved.includes("Admitted by at least one projection: 1 of 1 knowledge artifact."));
  assert.ok(approved.includes("review current reviewed by team-assessment"));

  // Demoted to a draft with its review removed, it is excluded as a draft, and the review reads as unpinned and unsigned.
  const unreview = (name: string, source: string) =>
    name !== "KB-ASMT-SCHEDULE.md"
      ? source
      : source
          .replace("  status: approved", "  status: draft")
          .replace(/\n {2}reviewedBy: .*\n {2}reviewedAt: .*\n/, "\n")
          .replace(/\n {2}extensions:\n(?: {4,}.*\n)+/, "\n");
  const draft = textOf(buildAtlas(example({ edit: unreview })).get("publication.html") as string);
  assert.ok(draft.includes("public public excluded draft"));
  assert.ok(
    draft.includes("needs review not pinned: BEH-ASMT-SCHEDULE, RULE-ASMT-AUTH, RULE-ASMT-FUTURE; no reviewer"),
  );
});

test("record text cannot open markup: titles and bodies are escaped", () => {
  const hostile = "Schedule *an* [x]{.y} <b>|</b> :::card & `tick`";
  const input = example({
    edit: (name, source) =>
      name === "BEH-ASMT-SCHEDULE.md"
        ? source
            .replace("title: Schedule a student assessment", `title: '${hostile}'`)
            .replace("# Schedule a student assessment", `# ${hostile}\n\n:::nope\n<script>x</script>\n:::`)
        : source,
  });
  const atlas = buildAtlas(input);
  const behavior = atlas.get("records/BEH-ASMT-SCHEDULE.html") as string;
  assert.ok(!/<script/i.test(behavior));
  assert.ok(!behavior.includes("<b>"));
  assert.ok(textOf(behavior).includes(hostile));
  for (const [path, source] of buildAtlasSources(input)) {
    assert.deepEqual(
      parseDocument(source).diagnostics.filter((d) => d.severity === "error"),
      [],
      path,
    );
  }
});

test("architecture, when supplied, is on the ownership page and its diagnostics on the diagnostics page", () => {
  const finding: Diagnostic = {
    code: "VSA005",
    severity: "error",
    origin: "architecture",
    artifact: "SLICE-ASMT-SCHEDULE",
    path: "examples/scheduling/SLICE-ASMT-SCHEDULE.md",
    message: "A dependency cycle runs through this slice.",
    remediation: "Break the cycle.",
  };
  const input = {
    ...example(),
    architecture: { diagnostics: [finding], summary: { slices: 1, cycles: 1, unresolved: [] } },
  };
  const atlas = buildAtlas(input);
  const ownership = textOf(atlas.get("ownership.html") as string);
  assert.ok(!ownership.includes("No architecture check supplied"));
  assert.ok(ownership.includes("cycles 1"));
  assert.ok(ownership.includes("VSA005"));
  const diagnostics = textOf(atlas.get("diagnostics.html") as string);
  assert.ok(diagnostics.includes("Architecture (1)"));
  assert.ok(diagnostics.includes("Markset syntax (0)"));
  assert.ok(diagnostics.includes("1 diagnostic in this snapshot: 1 of 1 is an error"));
  assert.ok(textOf(buildAtlas(example()).get("ownership.html") as string).includes("No architecture check supplied"));
});

test("a snapshot whose graph hash is not the graph's is refused", () => {
  const input = example();
  assert.throws(() => buildAtlas({ ...input, snapshot: { ...input.snapshot, graphHash: OLD_HASH } }), /graph hash/);
});

test("deterministic: two builds, and a build from the files in another order, are byte-identical", () => {
  const runs = (hash: string) => [review(hash), review(OLD_HASH, { evidenceId: "EV-REVIEW-000" })];
  const first = buildAtlas(example({ commit: COMMIT, runs }));
  const second = buildAtlas(example({ commit: COMMIT, runs }));
  const reordered = buildAtlas(example({ commit: COMMIT, runs, reverse: true }));
  assert.deepEqual([...second], [...first]);
  assert.deepEqual([...reordered], [...first]);
});

test("BEH-ATLAS, BEH-DELIVERY: the overview and a record's page show delivery beside the status, and count it", () => {
  const atlas = buildAtlas(
    example({
      edit: (name, source) =>
        name === "BEH-ASMT-SCHEDULE.md" ? source.replace("status: draft", "status: draft\n  delivery: built") : source,
    }),
  );
  const overview = textOf(atlas.get("index.html") ?? "");
  assert.match(overview, /Behaviors whose work is built 1 of 1/);
  assert.match(overview, /Behaviors whose work is planned 0 of 1/);
  assert.match(overview, /Status says what a person approved; delivery says whether the code exists/);
  assert.match(overview, /status draft · delivery not stated/, "the capability states none");
  assert.match(overview, /Schedule a student assessment draft built/);
  const record = textOf(atlas.get("records/BEH-ASMT-SCHEDULE.html") ?? "");
  assert.match(record, /Status draft Delivery built/);
  const knowledge = textOf(atlas.get("records/KB-ASMT-SCHEDULE.html") ?? "");
  assert.doesNotMatch(knowledge, /Delivery/, "knowledge does not carry delivery");
});
