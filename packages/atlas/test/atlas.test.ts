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
  assert.equal(atlas.get("atlas.css"), readFileSync(defaultStylesheetPath, "utf8"));
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

test("every page is Markset version 0 with the derived atlas block, and parses without a diagnostic", () => {
  for (const input of [example(), example({ runs: (hash) => [review(hash, { result: "fail" })] })]) {
    for (const [path, source] of buildAtlasSources(input)) {
      const parsed = parseDocument(source);
      assert.deepEqual(parsed.diagnostics, [], path);
      assert.equal(parsed.frontmatter?.markset, 0, path);
      assert.match(
        source,
        /\nintentset-atlas:\n {2}profile: intentset\/atlas\/0\.1\n {2}derived: true\n {2}snapshot:\n/,
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
  const draft = textOf(buildAtlas(example()).get("publication.html") as string);
  assert.ok(draft.includes("public public excluded draft"));
  assert.ok(
    draft.includes("needs review not pinned: BEH-ASMT-SCHEDULE, RULE-ASMT-AUTH, RULE-ASMT-FUTURE; no reviewer"),
  );

  const hashes = new Map<string, string>();
  const pin = (name: string, source: string) => {
    if (name !== "KB-ASMT-SCHEDULE.md") return source;
    const pins = ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"]
      .map((id) => `        ${id}: ${hashes.get(id)}`)
      .join("\n");
    return source
      .replace("  status: draft", "  status: approved")
      .replace(
        "  revision: 1",
        `  revision: 1\n  reviewedBy: reviewer-ana\n  reviewedAt: '2026-09-30'\n  extensions:\n    intentset.org/review:\n      sources:\n${pins}`,
      );
  };
  for (const [id, artifact] of example().graph.artifacts) hashes.set(id, artifact.sourceHash);
  const approved = textOf(buildAtlas(example({ edit: pin })).get("publication.html") as string);
  assert.ok(approved.includes("public public excluded visibility"));
  assert.ok(approved.includes("customer public, customer would publish"));
  assert.ok(approved.includes("Admitted by at least one projection: 1 of 1 knowledge artifact."));
  assert.ok(approved.includes("review current reviewed by reviewer-ana"));
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
