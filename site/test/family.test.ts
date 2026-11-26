import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { build, CONTENT_PAGES, type Page, sitePages } from "../build.ts";

/**
 * The family's two products on intentset.org (Gary's decision of 2026-11-25, the naming rule in CLAUDE.md). A narrative
 * page names each at most once, in one block, with its family label beside it; every other page the site writes itself
 * names neither; and no page links to either. The adoption log keeps its own limits (build.test.ts), the readers page
 * lists both, and a page generated from spec/ or tests/ is exempt by how it is made, not by its address.
 */

// reef docs/conventions.md, Status labels; reef docs/family.md for the loop.
const LABELS = { Streamlane: "Product · In development", Driftline: "Product · In planning" } as const;
const PRODUCTS = Object.keys(LABELS) as Array<keyof typeof LABELS>;

// The narrative pages the rule names, by source file. The rule's own list, not an exemption.
const NARRATIVE = new Set([
  "index.md",
  "how-it-works.md",
  "start.md",
  "adopt.md",
  "verify.md",
  "about.md",
  "roadmap.md",
  "introducing.md",
]);
const ADOPTION_LOG = "pilot/index.html";
const READERS = "tools/readers/index.html";

const narrativePaths = new Set(CONTENT_PAGES.filter(([, file]) => NARRATIVE.has(file)).map(([path]) => path));

const BLOCK =
  /<\/?(?:p|li|ul|ol|h[1-6]|td|th|tr|table|thead|tbody|dt|dd|dl|figcaption|figure|blockquote|summary|details|pre|div|section|aside|header|footer|nav)\b[^>]*>/gi;

/** A page's <main> as its blocks' text: every block-level tag is a boundary, and the rest of the markup is dropped. */
export function blocks(html: string): string[] {
  return html
    .split(BLOCK)
    .map((fragment) =>
      fragment
        .replace(/<[^>]+>/g, " ")
        .replace(/&middot;|&#183;|&#xb7;/gi, "·")
        .replace(/&amp;/g, "&")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((text) => text !== "");
}

/** What breaks the rule in one page's <main>: a product named in two blocks, without its label, or on a page that may not. */
export function namingProblems(html: string, narrative: boolean): string[] {
  const problems: string[] = [];
  const all = blocks(html);
  for (const product of PRODUCTS) {
    const naming = all.filter((text) => text.includes(product));
    if (naming.length === 0) continue;
    if (!narrative) {
      problems.push(`${product} is named on a page that names neither: "${naming[0]}"`);
      continue;
    }
    if (naming.length > 1)
      problems.push(`${product} is named in ${naming.length} blocks: ${naming.map((t) => `"${t}"`).join(", ")}`);
    for (const text of naming) {
      if (!text.includes(`${product} (${LABELS[product]})`)) problems.push(`${product} without its label: "${text}"`);
    }
  }
  return problems;
}

const { pages } = await sitePages();
const dist = await mkdtemp(join(tmpdir(), "intentset-family-"));
const built = await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

function exempt(page: Page): boolean {
  return page.generatedFrom !== undefined || page.path === ADOPTION_LOG || page.path === READERS;
}

test("a narrative page names each product in at most one block, with its family label", () => {
  const checked = pages.filter((page) => !exempt(page));
  assert.ok(
    checked.some((page) => narrativePaths.has(page.path)),
    "the narrative pages are among those checked",
  );
  for (const page of checked) {
    assert.deepEqual(namingProblems(page.body, narrativePaths.has(page.path)), [], page.path);
  }
});

test("the reference pages and the walkthrough name neither product", () => {
  const walkthrough = pages.find((page) => page.path === "example/index.html");
  assert.ok(walkthrough, "the walkthrough is built");
  assert.match(walkthrough.body, /href="\.\.\/pilot\/"/, "the walkthrough still links the adoption log");
  for (const page of pages.filter((page) => !exempt(page) && !narrativePaths.has(page.path))) {
    for (const product of PRODUCTS) assert.ok(!page.body.includes(product), `${page.path} names ${product}`);
  }
});

test("the exemption is by how a page is made: rendered from spec/ or generated from tests/", () => {
  const generated = pages.filter((page) => page.generatedFrom !== undefined);
  assert.ok(
    generated.some((page) => page.generatedFrom === "spec"),
    "the specifications are rendered from spec/",
  );
  assert.deepEqual(
    generated.filter((page) => page.generatedFrom === "tests").map((page) => page.path),
    ["conformance/index.html"],
  );
  for (const page of generated)
    assert.ok(page.path.startsWith("specifications/") || page.path === "conformance/index.html", page.path);
});

test("no page links to either product, the exempt ones included", async () => {
  for (const path of built) {
    const page = await readFile(join(dist, path), "utf8");
    // A fragment is a heading on the page itself (the adoption log's "Streamlane" section), never a link to a product.
    for (const [, href] of page.matchAll(/href="([^"#]*)/g)) {
      assert.doesNotMatch(href, /streamlane|driftline/i, `${path}: ${href}`);
    }
  }
});

test("the check fails on a second naming block, a missing label, or a page that names neither", () => {
  const labelled = "<p>Streamlane (Product · In development) and Driftline (Product · In planning).</p>";
  assert.deepEqual(namingProblems(labelled, true), []);
  assert.deepEqual(namingProblems(labelled.replace("·", "&middot;"), true), [], "an entity reads as its character");
  assert.equal(namingProblems(`${labelled}<p>Streamlane again.</p>`, true).length, 2, "a second block, unlabelled");
  assert.equal(namingProblems(`${labelled}<ul><li>Driftline (Product · In planning)</li></ul>`, true).length, 1);
  assert.equal(namingProblems("<h3>Streamlane, a work management product</h3>", true).length, 1, "a missing label");
  assert.equal(namingProblems(labelled, false).length, 2, "a reference page names neither");
  assert.deepEqual(namingProblems("<p>A work management product.</p>", false), []);
});
