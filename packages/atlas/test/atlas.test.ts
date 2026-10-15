import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { test } from "node:test";
import {
  type Diagnostic,
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
import { type AtlasInput, buildAtlas, buildAtlasSources } from "../src/index.ts";
import { chartLabel } from "../src/pages/overview.ts";

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
  "ownership.html",
  "verification.html",
  "publication.html",
  "diagnostics.html",
  "behaviors/BEH-ASMT-SCHEDULE.html",
  "atlas.css",
];

test("BEH-ATLAS: the Atlas of the example has the five pages, a page per behavior, and the stylesheet once", () => {
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

test("no page carries a script", () => {
  for (const input of [example(), example({ runs: (hash) => [review(hash)] })]) {
    for (const [path, html] of pages(buildAtlas(input))) assert.ok(!/<script/i.test(html), path);
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

test("BEH-ATLAS: the layout is Markset's: the context bundle as a grid of cards, the record text folded, coverage drawn as charts", () => {
  const input = example({ runs: (hash) => [review(hash)] });
  const atlas = buildAtlas(input);
  const behavior = atlas.get("behaviors/BEH-ASMT-SCHEDULE.html") ?? "";
  assert.match(behavior, /<div class="ms-grid" data-cols="3"/);
  assert.ok(
    (behavior.match(/class="ms-grid-item">\s*<section class="ms-card/g) ?? []).length >= 4,
    "one card per role",
  );
  assert.match(behavior, /<details class="ms-callout"/, "the record text is folded");
  // A chart is drawn in front of its table, and the table stays on the page.
  const verification = atlas.get("verification.html") ?? "";
  assert.match(verification, /<svg class="ms-chart" data-chart="bar"[\s\S]*?<table>/);
  for (const html of atlas.values()) assert.doesNotMatch(html, /<script/i, "still no script");
});

test("a capability's chart label drops CAP- and shortens a long ID", () => {
  assert.equal(chartLabel("CAP-ASK"), "ASK");
  assert.equal(chartLabel("CAP-LEARN-FROM-QUESTIONS"), "LEARN-FROM-QUESTI…");
  assert.equal(chartLabel("OTHER-ID"), "OTHER-ID");
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
  const behavior = textOf(atlas.get("behaviors/BEH-ASMT-SCHEDULE.html") as string);
  assert.ok(behavior.includes("Verified: not assessed, because no run evidence was supplied."));
});

test("a pass recorded against another graph hash reads as stale, in words, and verifies nothing", () => {
  const atlas = buildAtlas(example({ commit: COMMIT, runs: () => [review(OLD_HASH)] }));
  const verification = textOf(atlas.get("verification.html") as string);
  assert.ok(!verification.includes("No run evidence supplied"));
  assert.ok(verification.includes("stale 1 of 1 verification definition"));
  assert.ok(verification.includes("current pass 0 of 1 verification definition"));
  assert.ok(verification.includes("Verified at this snapshot 0 of 1 0 of 2 0 of 1 evidence"));
  const behavior = textOf(atlas.get("behaviors/BEH-ASMT-SCHEDULE.html") as string);
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

test("no count is a percentage", () => {
  for (const [path, html] of pages(buildAtlas(example({ runs: (hash) => [review(hash)] })))) {
    assert.ok(!/\d\s*%/.test(textOf(html)), path);
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
  const behavior = atlas.get("behaviors/BEH-ASMT-SCHEDULE.html") as string;
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
