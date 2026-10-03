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

const PAGE_OF: Record<string, string> = {
  home: "index.html",
  start: "start/index.html",
  specifications: "specifications/index.html",
  markset: "markset/index.html",
  roadmap: "roadmap/index.html",
  about: "about/index.html",
};

test("each page carries the IA document's copy verbatim: its heading, its first paragraph and its section headings", async () => {
  const blocks = await copyBlocks();
  assert.deepEqual([...blocks.keys()].sort(), Object.keys(PAGE_OF).sort(), "every copy section has a page");
  for (const [name, block] of blocks) {
    const html = await readFile(join(dist, PAGE_OF[name]), "utf8");
    const body = text(html.slice(html.indexOf("<main"), html.indexOf("</main>")));
    const h1 = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");
    assert.equal(h1, block.h1, `${name}: h1`);
    assert.ok(body.includes(block.first), `${name}: first paragraph is not verbatim: ${block.first}`);
    for (const heading of block.headings) {
      assert.ok(body.includes(heading), `${name}: section heading is not verbatim: ${heading}`);
    }
  }
});

test("the status notes the IA names are on their pages, as callouts", async () => {
  const notes: Array<[string, string]> = [
    ["index.html", "The specifications are ready for review. The reference toolchain is being designed."],
    ["index.html", "Illustrative model. These links describe the proposed structure, not a live verification report."],
    [
      "start/index.html",
      "This is a manual adoption guide for the v0.1 draft. There is no installation command in this package.",
    ],
    [
      "specifications/index.html",
      "All three documents are initial drafts. The TypeScript reference implementation is planned.",
    ],
    [
      "markset/index.html",
      "Upstream Markset compatibility will be pinned and tested before the reference publisher ships.",
    ],
  ];
  for (const [page, note] of notes) {
    const html = await readFile(join(dist, page), "utf8");
    const callouts = [...html.matchAll(/<div class="ms-callout-body">([\s\S]*?)<\/div>/g)].map((m) => text(m[1]));
    assert.ok(callouts.includes(note), `${page}: no callout reads "${note}"`);
  }
});
