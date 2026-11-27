/**
 * The Changelog page and its Atom feed (#166): both built from CHANGELOG.md, so a release's notes are on the site, in a
 * reader's feed and on GitHub from one text. The page is at /changelog/ in Reference, and the feed at /changelog.xml is
 * linked from the head of every page.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { parseChangelog } from "../../scripts/changelog.ts";
import {
  atomFeed,
  build,
  CANONICAL,
  CHANGELOG_FEED,
  CHANGELOG_PAGE,
  canonicalUrl,
  changelogAnchor,
  NOT_FOUND,
  RAILS,
  railLinks,
} from "../build.ts";

const root = resolve(import.meta.dirname, "..", "..");
const dist = await mkdtemp(join(tmpdir(), "intentset-changelog-"));
const pages = await build(dist);
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

const read = (path: string) => readFile(join(dist, path), "utf8");
const entries = parseChangelog(await readFile(join(root, "CHANGELOG.md"), "utf8"));
const released = entries.filter((entry) => entry.date !== null);

test("the Changelog is a page of Reference, in the sitemap, with one anchored heading per release", async () => {
  assert.ok(pages.includes(CHANGELOG_PAGE));
  assert.equal(CHANGELOG_PAGE, "changelog/index.html");
  const reference = RAILS.find((rail) => rail.title === "Reference");
  assert.ok(
    reference && railLinks(reference).some(([label, href]) => label === "Changelog" && href === CHANGELOG_PAGE),
  );
  assert.ok((await read("sitemap.xml")).includes(`<loc>${canonicalUrl(CHANGELOG_PAGE)}</loc>`));
  assert.equal(canonicalUrl(CHANGELOG_PAGE), `${CANONICAL}changelog/`);

  const page = await read(CHANGELOG_PAGE);
  assert.match(page, /<h1 id="changelog">Changelog<\/h1>/);
  for (const entry of released) {
    assert.ok(
      page.includes(`<h2 id="${changelogAnchor(entry.version)}">${entry.version} — ${entry.date}</h2>`),
      `${entry.version} has no anchored heading`,
    );
  }
  assert.equal((page.match(/<h2 id="v/g) ?? []).length, released.length);
  assert.match(page, /<a href="\.\.\/changelog\.xml">Atom feed of releases<\/a>/);
});

test("the page shows the summary above the detail, Breaking first, for the current release", async () => {
  const page = await read(CHANGELOG_PAGE);
  const start = page.indexOf(`<h2 id="${changelogAnchor(released[0]!.version)}"`);
  const end = page.indexOf('<h2 id="v', start + 1);
  const section = page.slice(start, end);
  const order = [...section.matchAll(/<h3 id="[^"]*">([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.equal(order[0], "Breaking");
  assert.equal(order.at(-1), "Details");
  assert.ok(section.includes("<code>intentset migrate --to 0.3</code>"));
});

test("a release's text is HTML in the page: nothing from the changelog becomes markup", async () => {
  const page = await read(CHANGELOG_PAGE);
  assert.doesNotMatch(page, /href="javascript:/i);
  assert.doesNotMatch(page.slice(page.indexOf("<main"), page.indexOf("</main>")), /<script/);
});

test("every page links the feed from its head, from the right depth, the 404 page from the root", async () => {
  for (const path of pages) {
    const head = (await read(path)).split("</head>")[0] as string;
    const depth = path === NOT_FOUND ? null : path.split("/").length - 1;
    const href =
      depth === null
        ? new URL(CHANGELOG_FEED, CANONICAL).pathname
        : `${depth === 0 ? "./" : "../".repeat(depth)}${CHANGELOG_FEED}`;
    assert.ok(
      head.includes(`<link rel="alternate" type="application/atom+xml" title="Intentset releases" href="${href}">`),
      `${path} does not link the feed`,
    );
  }
});

test("the feed has one entry per release, linked to its anchor on the page and dated with its release", async () => {
  const feed = await read(CHANGELOG_FEED);
  assert.match(feed, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  const items = [...feed.matchAll(/<entry>\n([\s\S]*?)\n<\/entry>/g)].map((m) => m[1] as string);
  assert.equal(items.length, released.length, "one entry per released version, and none for Unreleased");
  const page = await read(CHANGELOG_PAGE);
  for (const [i, entry] of released.entries()) {
    const item = items[i] as string;
    const link = `${canonicalUrl(CHANGELOG_PAGE)}#${changelogAnchor(entry.version)}`;
    assert.ok(item.includes(`<id>${link}</id>`), `${entry.version} id`);
    assert.ok(item.includes(`<link rel="alternate" type="text/html" href="${link}"/>`), `${entry.version} link`);
    assert.ok(item.includes(`<updated>${entry.date}T00:00:00Z</updated>`), `${entry.version} updated`);
    assert.ok(item.includes(`<title>Intentset ${entry.version}</title>`));
    assert.ok(page.includes(`id="${changelogAnchor(entry.version)}"`), `${entry.version}'s anchor is on the page`);
  }
  assert.ok(
    feed.includes(`<updated>${released[0]!.date}T00:00:00Z</updated>\n<author>`),
    "the feed is as new as its newest entry",
  );
  assert.ok(feed.includes(`<link rel="self" type="application/atom+xml" href="${CANONICAL}changelog.xml"/>`));
});

test("a release with a summary is told by its summary in the feed, an earlier one by its first paragraph", async () => {
  const feed = await read(CHANGELOG_FEED);
  const items = [...feed.matchAll(/<entry>\n([\s\S]*?)\n<\/entry>/g)].map((m) => m[1] as string);
  const content = (item: string) => /<content type="html">([\s\S]*)<\/content>/.exec(item)?.[1] ?? "";
  assert.ok(content(items[0] as string).startsWith("&lt;h3&gt;Breaking&lt;/h3&gt;"));
  assert.doesNotMatch(content(items[0] as string), /Details/);
  const earlier = content(items[1] as string);
  assert.ok(earlier.startsWith("&lt;p&gt;&lt;strong&gt;"), "the bold sentence that opens the entry");
  // The content is escaped HTML: no raw angle bracket reaches the XML.
  for (const item of items) assert.doesNotMatch(content(item), /[<>]/);
});

test("the feed escapes what an entry says, and drops characters XML 1.0 forbids", () => {
  const hostile = parseChangelog(
    '## 1.0.0 — 2026-01-02\n\n### Added\n\n- **<script>alert(1)</script> & "quotes"** `x < y`\n\n## Unreleased\n\n### Added\n\n- **Not yet.**\n',
  );
  const feed = atomFeed(hostile, (entry) => `<p>${entry.summary} & <b>\u0001</b></p>`);
  assert.equal((feed.match(/<entry>/g) ?? []).length, 1);
  assert.doesNotMatch(feed, /<script/);
  assert.ok(!feed.includes(String.fromCharCode(1)));
  assert.match(
    feed,
    /&lt;p&gt;### Added[\s\S]*&amp;lt;script|&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quotes&quot;/,
  );
  assert.doesNotMatch(feed, /Not yet/);
  const real = atomFeed(hostile);
  assert.doesNotMatch(real, /<script/);
  assert.match(real, /&lt;strong&gt;/);
  assert.match(real, /<updated>2026-01-02T00:00:00Z<\/updated>/);
});
