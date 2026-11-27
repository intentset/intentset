import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { build, sitePages } from "../build.ts";

/**
 * The family's two products on intentset.org (the user's decision of 2026-11-26, the naming rule in CLAUDE.md, which
 * replaced Gary's of 2026-11-25): no page the site writes names Streamlane or Driftline, and none links to either. A
 * visitor here came to learn Intentset, and a product they cannot use reads as a different product entirely. A page
 * rendered from spec/ or generated from tests/ is exempt by how it is made, not by its address.
 */
const PRODUCTS = ["Streamlane", "Driftline"];

const { pages } = await sitePages();
const dist = await mkdtemp(join(tmpdir(), "intentset-family-"));
const built = await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

test("no page the site writes itself names either product", () => {
  const written = pages.filter((page) => page.generatedFrom === undefined);
  assert.ok(
    written.some((page) => page.path === "index.html"),
    "Home is among the pages checked",
  );
  for (const page of written) {
    for (const product of PRODUCTS) assert.ok(!page.body.includes(product), `${page.path} names ${product}`);
  }
});

test("the exemption is by how a page is made: rendered from spec/ or generated from tests/", () => {
  const generated = pages.filter((page) => page.generatedFrom !== undefined);
  assert.ok(
    generated.some((page) => page.generatedFrom === "spec"),
    "the specifications are rendered from spec/",
  );
  for (const page of generated)
    assert.ok(page.path.startsWith("specifications/") || page.path === "conformance/index.html", page.path);
});

test("no page links to either product", async () => {
  for (const path of built) {
    const page = await readFile(join(dist, path), "utf8");
    for (const [, href] of page.matchAll(/href="([^"#]*)/g)) {
      assert.doesNotMatch(href, /streamlane|driftline/i, `${path}: ${href}`);
    }
  }
});
