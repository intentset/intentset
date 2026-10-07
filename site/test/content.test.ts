import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { parseDocument } from "@markset-lang/parser";
import { build, CONTENT_PAGES, VERSION } from "../build.ts";

const root = resolve(import.meta.dirname, "..", "..");
const contentDir = join(root, "site", "content");

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

/** The pages the retired phrases are checked on. */
const RETIRED_PHRASE_PAGES = [
  "index.html",
  "start/index.html",
  "specifications/index.html",
  "markset/index.html",
  "roadmap/index.html",
  "about/index.html",
];

test("the status notes are on their pages, as callouts, and none still says the toolchain is unbuilt", async () => {
  const notes: Array<[string, string]> = [
    [
      "index.html",
      `The specifications are ready for review. The reference toolchain, version ${VERSION}, is published to try them against.`,
    ],
    ["index.html", "Illustrative model. These links describe the proposed structure, not a live verification report."],
    [
      "start/index.html",
      `The reference toolchain is an early release, at ${VERSION}. The architecture check needs TypeScript 7; in a repository on an earlier TypeScript, run the toolchain without installing it, as npx -p @intentset/cli -p typescript@7 intentset, or with pnpm as pnpm dlx --package=@intentset/cli --package=typescript@7 intentset.`,
    ],
    [
      "specifications/index.html",
      `All five documents are drafts, each with a dated revision. Core §1 says what a change to them means, and the changelog records every one. The TypeScript reference implementation implements them, and its conformance suite is published for other implementations. The reference toolchain is at ${VERSION} on npm.`,
    ],
    [
      "markset/index.html",
      "The reference publisher pins Markset 0.4.1 and validates every document it generates with Markset before writing it.",
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
  for (const page of RETIRED_PHRASE_PAGES) {
    const body = text(await readFile(join(dist, page), "utf8"));
    for (const phrase of retired) assert.ok(!body.includes(phrase), `${page} still says "${phrase}"`);
  }
});
