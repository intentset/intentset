import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { parseDocument } from "@markset-lang/parser";
import { build, CONTENT_PAGES } from "../build.ts";

const root = resolve(import.meta.dirname, "..", "..");
const contentDir = join(root, "site", "content");
const IA = join(root, "docs", "requirements", "site", "06-intentset-information-architecture-and-copy.md");

const dist = await mkdtemp(join(tmpdir(), "intentset-content-"));
await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

function text(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Markdown inline markup reduced to the text a reader sees. */
function plain(markdown: string): string {
  return markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

test("every content page parses as Markset with no error diagnostics", async () => {
  const files = (await readdir(contentDir)).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(
    files,
    CONTENT_PAGES.map(([, file]) => file).sort(),
    "site/content and CONTENT_PAGES name the same files",
  );
  for (const file of files) {
    const { diagnostics } = parseDocument(await readFile(join(contentDir, file), "utf8"));
    const errors = diagnostics.filter((d) => d.severity === "error");
    assert.deepEqual(errors, [], file);
  }
});

/**
 * The IA document's copy sections, each reduced to the heading, the first
 * paragraph after it and every section heading under it. Those are the blocks a
 * reader meets first on each page, and the ones a paraphrase would change.
 */
async function copyBlocks(): Promise<Map<string, { h1: string; first: string; headings: string[] }>> {
  const source = await readFile(IA, "utf8");
  const out = new Map<string, { h1: string; first: string; headings: string[] }>();
  const sections = source.split(/^## /m).slice(1);
  for (const section of sections) {
    const [title, ...rest] = section.split("\n");
    const m = /^(\w+) page copy$|^(Homepage) copy$/.exec(title.trim());
    if (!m) continue;
    const name = (m[1] ?? "home").toLowerCase();
    const lines = rest.map((l) => l.trimEnd());
    const h1At = lines.findIndex((l) => l.startsWith("# "));
    assert.ok(h1At !== -1, `${title}: no h1`);
    const first = lines.slice(h1At + 1).find((l) => l !== "" && !l.startsWith("#") && !l.startsWith("**"));
    assert.ok(first, `${title}: no first paragraph`);
    const headings = lines.filter((l) => l.startsWith("### ")).map((l) => plain(l.slice(4)));
    out.set(name, { h1: plain(lines[h1At].slice(2)), first: plain(first), headings });
  }
  return out;
}

/**
 * Home sections that moved to How it works on 2026-10-03, when it became a page
 * of its own and the home page kept to the outcome. Their headings are kept,
 * on the page they moved to.
 */
const MOVED_HEADINGS: Record<string, string> = {
  "Open files. Explicit meaning.": "how-it-works/index.html",
  "Rich documents, with Markset.": "how-it-works/index.html",
};

const PAGE_OF: Record<string, string> = {
  home: "index.html",
  start: "start/index.html",
  specifications: "specifications/index.html",
  markset: "markset/index.html",
  roadmap: "roadmap/index.html",
  about: "about/index.html",
};

/**
 * Headings revised on 2026-10-03, when the 0.1 toolchain was published and the
 * roadmap's future work became delivered work, and on 2026-10-04, when the home
 * page's status stopped calling the toolchain the next thing. The IA document
 * stays frozen as the handoff; site/content is the copy's source of truth from
 * here, and this list is what may differ from the handoff.
 */
const REVISED_HEADINGS: Record<string, string> = {
  "Next: validate the model": "Delivered in 0.1: validate the model",
  "Then: connect the repository": "Delivered in 0.1: connect the repository",
  "Then: help people and agents review": "Delivered in 0.1: help people and agents review",
  "Specifications first. A reference toolchain next.": "Specifications in review. A toolchain to try them with.",
};

/**
 * Pages rewritten rather than revised, so none of the handoff's copy is held
 * on them. The roadmap, 2026-10-04: its copy was a plan of the owner's work,
 * milestone by milestone, and a reader needs what is stable, what 1.0 waits
 * on, what is not planned and how to influence it. Home and Start, the same
 * day: the handoff pictured a person writing records by hand, and Intentset's
 * records are written by the agents that change the code and reviewed by
 * people, which is the reason to use it and the way to adopt it.
 */
const REWRITTEN = new Set(["roadmap", "home", "start"]);

test("each page carries the IA document's copy verbatim: its heading, its first paragraph and its section headings", async () => {
  const blocks = await copyBlocks();
  assert.deepEqual([...blocks.keys()].sort(), Object.keys(PAGE_OF).sort(), "every copy section has a page");
  for (const [name, block] of blocks) {
    if (REWRITTEN.has(name)) continue;
    const html = await readFile(join(dist, PAGE_OF[name]), "utf8");
    const body = text(html.slice(html.indexOf("<main"), html.indexOf("</main>")));
    const h1 = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");
    assert.equal(h1, block.h1, `${name}: h1`);
    assert.ok(body.includes(block.first), `${name}: first paragraph is not verbatim: ${block.first}`);
    for (const original of block.headings) {
      const heading = REVISED_HEADINGS[original] ?? original;
      const moved = MOVED_HEADINGS[original];
      const where = moved ? await readFile(join(dist, moved), "utf8") : html;
      const text_ = moved ? text(where.slice(where.indexOf("<main"), where.indexOf("</main>"))) : body;
      assert.ok(text_.includes(heading), `${name}: section heading is not verbatim: ${heading}`);
    }
  }
});

test("the status notes are on their pages, as callouts, and none still says the toolchain is unbuilt", async () => {
  const notes: Array<[string, string]> = [
    [
      "index.html",
      "The specifications are ready for review. The reference toolchain, version 0.4, is published to try them against.",
    ],
    ["index.html", "Illustrative model. These links describe the proposed structure, not a live verification report."],
    [
      "start/index.html",
      "The reference toolchain is an early release, at 0.4. The architecture check needs TypeScript 7; in a repository on an earlier TypeScript, run the toolchain without installing it, as npx -p @intentset/cli -p typescript@7 intentset.",
    ],
    [
      "specifications/index.html",
      "All five documents are initial drafts. The TypeScript reference implementation implements them, and its conformance suite is published for other implementations. The reference toolchain is at 0.4 on npm.",
    ],
    [
      "markset/index.html",
      "The reference publisher pins Markset 0.3.4 and validates every document it generates with Markset before writing it.",
    ],
  ];
  for (const [page, note] of notes) {
    const html = await readFile(join(dist, page), "utf8");
    // Inline code becomes a space when tags are stripped, so close up the space before punctuation.
    const callouts = [...html.matchAll(/<div class="ms-callout-body">([\s\S]*?)<\/div>/g)].map((m) =>
      text(m[1]).replace(/\s+([,.;:])/g, "$1"),
    );
    assert.ok(callouts.includes(note), `${page}: no callout reads "${note}"`);
  }
  // Superseded on 2026-10-03, when 0.1 was published: none may come back.
  const retired = [
    "The reference toolchain is being designed",
    "There is no installation command",
    "The TypeScript reference implementation is planned",
    "before the reference publisher ships",
    "The planned publisher",
    "not yet presented as finished tools",
    "The working name is Intentset",
    // Superseded on 2026-10-04, when 0.3 was out and the export with it.
    "A first reference toolchain, version 0.1",
    "Version 0.1 is on npm",
    "the export contract arrives with 0.2",
    "A reference toolchain next",
    "All four documents",
    // The roadmap as a plan of the work, retired 2026-10-04.
    "Delivered in 0.1",
    "implementation roadmap",
    // Records written by hand, and 0.3, retired 2026-10-04.
    "manual adoption guide",
    "version 0.3",
    "at 0.3 on npm",
  ];
  for (const page of Object.values(PAGE_OF)) {
    const body = text(await readFile(join(dist, page), "utf8"));
    for (const phrase of retired) assert.ok(!body.includes(phrase), `${page} still says "${phrase}"`);
  }
});
