/**
 * What the build writes beside the pages, and the tokens it substitutes into
 * them: the sitemap, robots.txt and the 404 page a crawler or a mistyped link
 * meets; the agent guide and llms.txt an agent reads; the schemas at the
 * addresses their $id names; and the release the pages name, read from
 * package.json rather than typed.
 */
import assert from "node:assert/strict";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { agentGuide, USAGE } from "@intentset/cli";
import { build, CANONICAL, CONTENT_PAGES, canonicalUrl, GUIDE_SCOPE, NOT_FOUND, siteGuide, VERSION } from "../build.ts";
import { contentType, WATCHED } from "../serve.ts";

const root = resolve(import.meta.dirname, "..", "..");
const dist = await mkdtemp(join(tmpdir(), "intentset-shell-"));
const pages = await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

const read = (path: string) => readFile(join(dist, path), "utf8");

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

test("the sitemap lists every page at its canonical address, and nothing else", async () => {
  const xml = await read("sitemap.xml");
  assert.match(
    xml,
    /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
  );
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const expected = pages
    .filter((p) => p !== NOT_FOUND)
    .map(canonicalUrl)
    .sort();
  assert.deepEqual([...listed].sort(), expected);
  assert.ok(listed.includes(CANONICAL), "the home page is listed at the site's root");
  assert.ok(listed.includes(new URL("tools/cli/", CANONICAL).href), "a page is listed by its directory");
  assert.doesNotMatch(xml, /404/, "the 404 page is not a page to index");
});

test("robots.txt allows everything and names the sitemap", async () => {
  assert.equal(
    await read("robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", CANONICAL).href}\n`,
  );
});

test("the 404 page wears the shell, links from the root, and asks not to be indexed", async () => {
  assert.ok(CONTENT_PAGES.some(([path]) => path === NOT_FOUND));
  const doc = await read(NOT_FOUND);
  assert.match(doc, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(doc, /rel="canonical"|og:url/, "it has no address of its own");
  assert.match(doc, /<header class="site-header">[\s\S]*<footer class="site-footer">/);
  assert.match(doc, /<link rel="stylesheet" href="\/css\/site\.css">/);
  assert.match(doc, /<a href="\/index\.html">Go to the home page<\/a>/);
  assert.match(doc, /<a class="site-skip" href="#main">/, "the skip link stays on the page");
  // Served at any depth, so no link may be relative.
  for (const [, url] of doc.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.ok(/^(\/|#|https?:)/.test(url), `relative link ${url} on the 404 page`);
  }
});

test("/guide.md is the guide init writes, from the same generator, with a placeholder for the scope", async () => {
  const guide = await read("guide.md");
  assert.equal(guide, siteGuide());
  assert.equal(guide, agentGuide([GUIDE_SCOPE]));
  assert.ok(guide.includes(`\`${GUIDE_SCOPE}\``), "the scope is a placeholder, not this repository's");
  const page = await read("guide/index.html");
  const main = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
  for (const [, heading] of guide.matchAll(/^## (.+)$/gm)) {
    assert.ok(text(main).includes(heading), `the rendered guide lacks "${heading}"`);
  }
  assert.match(main, /<a href="\.\.\/guide\.md">guide\.md<\/a>/, "the page links the file");
});

test("llms.txt points an agent at the guide, the specifications and Markset's guide", async () => {
  const llms = await read("llms.txt");
  assert.match(llms, /^# Intentset\n\n> /);
  for (const url of [
    new URL("guide.md", CANONICAL).href,
    new URL("specifications/", CANONICAL).href,
    new URL("tools/cli/", CANONICAL).href,
    "https://markset.org/guide.md",
  ]) {
    assert.ok(llms.includes(`](${url})`), `llms.txt does not link ${url}`);
  }
  assert.ok(llms.includes(".intentset/agents.md"), "it says where a repository's own copy is");
});

test("every schema is served under /spec/ unchanged, at the address its $id names", async () => {
  const schemas = (await readdir(join(root, "spec"))).filter((f) => f.endsWith(".schema.json")).sort();
  assert.ok(schemas.length >= 4);
  assert.deepEqual((await readdir(join(dist, "spec"))).sort(), schemas);
  let ids = 0;
  for (const name of schemas) {
    const source = await readFile(join(root, "spec", name), "utf8");
    assert.equal(await read(join("spec", name)), source, name);
    const id = (JSON.parse(source) as { $id?: string }).$id;
    if (id === undefined) continue;
    ids++;
    const url = new URL(id);
    assert.equal(url.host, new URL(CANONICAL).host, `${name}: $id names another host`);
    assert.equal(url.pathname, `/spec/${name}`, `${name}: $id is not where the site serves it`);
  }
  assert.ok(ids >= 2, "the export and evidence schemas declare their $id");
});

test("the pages name the release in package.json, through {{version}}, and no page types one", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
  assert.equal(VERSION, pkg.version);
  const home = await read("index.html");
  assert.ok(
    text(home).includes(`The reference toolchain, version ${VERSION}, is published to try them against.`),
    "the hero names the release",
  );
  // A toolchain version typed into a page was stale within a day: the hero said
  // 0.4 while the packages were at 0.6. A future version (1.0) is not a release.
  for (const file of await readdir(join(root, "site", "content"))) {
    const source = await readFile(join(root, "site", "content", file), "utf8");
    assert.doesNotMatch(source, /\b(?:at|version) 0\.\d+/, `${file} types a release; write {{version}}`);
  }
});

test("the command page carries the command's own help, verbatim", async () => {
  const page = await read("tools/cli/index.html");
  const blocks = [...page.matchAll(/<code class="language-text">([\s\S]*?)<\/code>/g)].map((m) =>
    m[1]
      .replace(/&#x3C;|&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x26;|&amp;/g, "&")
      .trimEnd(),
  );
  assert.ok(blocks.includes(USAGE.trimEnd()), "the usage block is not the command's USAGE");
});

test("the accent text is coralreefventures.com's Intentset token", async () => {
  const css = await readFile(join(root, "site", "site.css"), "utf8");
  assert.match(css, /--ms-accent: light-dark\(#2c6a54, #7cc3a8\);/);
  assert.doesNotMatch(css, /#1f6b5a/i, "the old accent is gone");
});

test("the development server watches what the build reads, and serves the new files as what they are", async () => {
  // Its list named a directory removed on 2026-10-04 and missed tests/ and the
  // guide's generator, which the build reads since 2026-10-05.
  for (const path of WATCHED) await access(join(root, path)).catch(() => assert.fail(`${path} does not exist`));
  for (const path of ["tests", "packages/cli/src"]) assert.ok(WATCHED.includes(path), `${path} is not watched`);
  assert.match(contentType("sitemap.xml"), /^application\/xml/);
  assert.match(contentType("llms.txt"), /^text\/plain/);
  assert.match(contentType("guide.md"), /^text\/markdown/);
});
