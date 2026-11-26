/**
 * The bar and the rails, as a reader meets them. The bar holds five sections
 * by what a reader came to do (decided 2026-10-05, after markset.org's); the
 * rail beside a page lists the rest of its section. Together with the footer's
 * row they are how every page is found, so a page none of them names is a page
 * nobody reads: these tests hold that, and that every URL the site had before
 * the change still answers.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { after, test } from "node:test";
import {
  ASK_URL,
  build,
  CHAT_PAGES,
  FOOTER_LINKS,
  NAV,
  NOT_FOUND,
  type RailItem,
  RAILS,
  railFor,
  railLinks,
  SERVE_NAME,
  EXAMPLE_TITLE,
  siteRails,
} from "../build.ts";
import { ATLAS_MAP_PAGE, REVIEW_PAGES } from "../example-atlas.ts";
import { publishedKnowledge } from "../knowledge.ts";

const dist = await mkdtemp(join(tmpdir(), "intentset-rail-"));
const pages = await build(dist);
// The rails as this build drew them: Reference lists the published knowledge once publication releases any.
const rails = siteRails(await publishedKnowledge(join(import.meta.dirname, "..", "..")));
const html = new Map<string, string>();
for (const page of pages) html.set(page, await readFile(join(dist, page), "utf8"));
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

/** The output path a link on a page leads to: a directory's address is its index.html. */
function target(page: string, href: string): string {
  let path = posix.normalize(href.startsWith("/") ? href.slice(1) : posix.join(posix.dirname(page), href));
  if (path === "." || path === "./") path = "";
  return path === "" || path.endsWith("/") ? `${path}index.html` : path;
}

/** The pages a page links to, by output path, from anywhere on it: bar, rail, body and footer. */
function linksFrom(page: string): Set<string> {
  const out = new Set<string>();
  for (const [, href] of (html.get(page) ?? "").matchAll(/href="([^"#?]*)/g)) {
    if (href === "" || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const to = target(page, href);
    if (html.has(to) && to !== page) out.add(to);
  }
  return out;
}

/** The hrefs of the section rail on a page, as output paths. */
/** A record of the worked example's page: the rail names it beneath Records, the entry that lists it (2026-11-02). */
const RECORD_PAGE = /^example\/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\/index\.html$/;
const RECORDS = "example/atlas/records/index.html";

/** The rail a page should carry: its section's links, and a record's page beneath Records. */
function expectedRail(page: string, section: Parameters<typeof railLinks>[0]): string[] {
  const links = railLinks(section).map(([, href]) => href);
  return RECORD_PAGE.test(page) ? links.flatMap((href) => (href === RECORDS ? [href, page] : [href])) : links;
}

function rail(page: string): string[] {
  const nav = /<nav class="site-rail"[^>]*>([\s\S]*?)<\/nav>/.exec(html.get(page) ?? "");
  if (!nav) return [];
  return [...nav[1].matchAll(/<a href="([^"]*)"/g)].map((m) => target(page, m[1]));
}

test("no link on the site ends in index.html: a page's address is its directory (decided 2026-10-15)", () => {
  for (const [page, doc] of html) {
    for (const [, href] of doc.matchAll(/href="([^"]*)"/g)) {
      const own = !/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("https://intentset.org/");
      assert.ok(!own || !/(^|\/)index\.html(#|$)/.test(href), `${page} links ${href}`);
    }
  }
});

test("every URL the site had before the bar changed still answers", () => {
  // The adoption log and the roadmap left the site on 2026-11-26 and answer their old addresses by sending the reader
  // to the repository (build.test.ts holds that). The bar changed on 2026-10-05 and no page moved: Reference is the
  // specifications index, Examples the worked example's, and the Markset page
  // and How it works kept their addresses inside a rail.
  for (const page of [
    "index.html",
    "how-it-works/index.html",
    "start/index.html",
    "specifications/index.html",
    "specifications/core/index.html",
    "specifications/vsa/index.html",
    "specifications/profile-typescript-amplify-gen2/index.html",
    "specifications/publication/index.html",
    "specifications/export/index.html",
    "about/index.html",
    "example/index.html",
  ]) {
    assert.ok(html.has(page), `${page} no longer exists`);
  }
});

test("every page is named by the bar, a rail or the footer's row, or is a record the worked example, the published knowledge or the Atlas lists", () => {
  // The privacy page is in the footer's row once the chat is launched.
  const chat = ASK_URL === null ? [] : CHAT_PAGES.map(([path]): [string, string] => ["", path]);
  const named = new Set([...NAV, ...FOOTER_LINKS, ...chat, ...rails.flatMap(railLinks)].map(([, href]) => href));
  const examples = linksFrom("example/index.html");
  const knowledge = linksFrom("knowledge/index.html");
  const atlas = linksFrom("example/atlas/index.html");
  for (const page of pages) {
    // Home is the wordmark, on every page.
    if (page === NOT_FOUND || page === "index.html") continue;
    if (named.has(page)) continue;
    assert.ok(
      (page.startsWith("example/") && (examples.has(page) || atlas.has(page))) ||
        (page.startsWith("knowledge/") && knowledge.has(page)),
      `${page} is reachable only from a sentence: give it a place in a rail`,
    );
  }
  // Every rail entry is a page that was built.
  for (const rail of rails) {
    for (const [label, href] of railLinks(rail))
      assert.ok(html.has(href), `${rail.title} rail: ${label} (${href}) was not built`);
  }
});

test("every page is reachable from the home page, and none of them is far", () => {
  const hops = new Map([["index.html", 0]]);
  const queue = ["index.html"];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of linksFrom(current)) {
      if (!hops.has(next)) {
        hops.set(next, (hops.get(current) as number) + 1);
        queue.push(next);
      }
    }
  }
  const unreachable = pages.filter((p) => p !== NOT_FOUND && !hops.has(p));
  assert.deepEqual(unreachable, [], "a page nothing links to is a page nobody reads");
  const worst = Math.max(...hops.values());
  assert.ok(worst <= 3, `the furthest page is ${worst} hops from home`);
});

test("a page in a section carries its section's rail, marks itself once, and the bar marks the section", () => {
  for (const page of pages) {
    const section = railFor(page, rails);
    const doc = html.get(page) ?? "";
    const bar = doc.slice(doc.indexOf('<nav class="site-nav"'), doc.indexOf("</nav>"));
    const current = [...bar.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    if (!section) {
      assert.deepEqual(rail(page), [], `${page} belongs to no section and has a rail`);
      continue;
    }
    assert.deepEqual(rail(page), expectedRail(page, section), `${page}: the ${section.title} rail`);
    const nav = /<nav class="site-rail"[^>]*>([\s\S]*?)<\/nav>/.exec(doc)?.[1] ?? "";
    const marked = (nav.match(/aria-current="page"/g) ?? []).length;
    // A record of the worked example is named beneath Records, which is marked as where the reader is.
    assert.equal(marked, expectedRail(page, section).includes(page) ? 1 : 0, `${page}: rail marks ${marked}`);
    if (RECORD_PAGE.test(page)) {
      assert.match(
        nav,
        /<a href="[^"]*atlas\/records\/" aria-current="true">Records<\/a>/,
        `${page}: Records is marked`,
      );
    } else assert.doesNotMatch(nav, /aria-current="true"/, `${page}: nothing is marked as a place`);
    const barLabel = NAV.find(([, href]) => href === railLinks(section)[0][1])?.[0];
    assert.deepEqual(current, [barLabel], `${page}: the bar marks ${current.join(", ") || "nothing"}`);
  }
  // Each bar item opens its section's rail at its first page.
  assert.deepEqual(
    RAILS.map((r) => railLinks(r)[0][1]),
    NAV.map(([, href]) => href),
  );
});

test("Reference holds the tools and the specifications; Get started is one path (2026-11-26)", () => {
  const links = (title: string) => railLinks(RAILS.find((r) => r.title === title) ?? { title, items: [] });
  const reference = links("Reference").map(([, href]) => href);
  for (const page of [
    "tools/index.html",
    "tools/cli/index.html",
    "guide/index.html",
    "specifications/core/index.html",
    "conformance/index.html",
    "glossary/index.html",
  ]) {
    assert.ok(reference.includes(page), `Reference lacks ${page}`);
  }
  // Set it up, then add it to CI, then what is for later as a group of its own. Each label is the page's h1.
  assert.deepEqual(RAILS.find((r) => r.title === "Get started")?.items, [
    ["Set up Intentset", "start/index.html"],
    ["Add Intentset to your CI", "start/ci/index.html"],
    {
      label: "Once one capability works",
      items: [
        ["Model the whole product with many agents", "adopt/index.html"],
        ["Make agents' work safe to accept", "verify/index.html"],
      ],
    },
  ]);
  const start = /<nav class="site-rail"[^>]*>([\s\S]*?)<\/nav>/.exec(html.get("adopt/index.html") ?? "")?.[1] ?? "";
  assert.match(
    start,
    /<li class="site-rail-group"><span class="site-rail-label">Once one capability works<\/span>\n<ul>/,
  );
  for (const page of ["start/index.html", "start/ci/index.html", "adopt/index.html", "verify/index.html"]) {
    const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html.get(page) ?? "")?.[1];
    const label = railLinks(RAILS.find((r) => r.title === "Get started") ?? RAILS[0]).find(
      ([, href]) => href === page,
    )?.[0];
    assert.equal(h1?.replaceAll("&#x27;", "'").replaceAll("&#39;", "'"), label, `${page}: the rail names its h1`);
  }
});

test("the one example is on How it works' rail, and its map, review pages and records are in Reference (2026-11-26)", () => {
  assert.deepEqual(RAILS.find((r) => r.title === "How it works")?.items, [
    ["How it works", "how-it-works/index.html"],
    [EXAMPLE_TITLE, "example/index.html"],
  ]);
  assert.ok(!NAV.some(([label]) => label === "Examples"), "Examples left the bar");
  const reference = RAILS.find((r) => r.title === "Reference");
  assert.ok(reference);
  const serve = (reference.items[0] as { items: RailItem[] }).items.find(
    (item): item is { label: string; items: RailItem[] } => !Array.isArray(item) && item.label === SERVE_NAME,
  );
  assert.deepEqual(serve?.items, [["The map", ATLAS_MAP_PAGE], ...REVIEW_PAGES]);
  assert.deepEqual(
    REVIEW_PAGES.map(([label]) => label),
    ["Overview", "Records", "Ownership", "Verification", "Publication", "Diagnostics"],
  );
  // The walkthrough links the map near its top.
  const walkthrough = /<main[\s\S]*?<\/main>/.exec(html.get("example/index.html") ?? "")?.[0] ?? "";
  const mapButton = walkthrough.indexOf('<span class="ms-span button primary"><a href="atlas/map/">');
  assert.ok(mapButton > 0, "the walkthrough's first button opens the map");
  assert.ok(mapButton < walkthrough.indexOf("<h2"), "the map's button is above the first step");
  const section = pages.filter((page) => page.startsWith("example/") && page !== "example/index.html");
  assert.ok(section.length > 20, `only ${section.length} review and record pages`);
  for (const page of section) {
    assert.deepEqual(rail(page), expectedRail(page, reference), `${page}: the Reference rail`);
    assert.equal(railFor(page, rails)?.title, "Reference", page);
  }
  assert.equal(railFor("example/index.html", rails)?.title, "How it works");
});

test("every address of the worked example still answers: the walkthrough at /example/, the map and every review page under /example/atlas/", () => {
  for (const page of [
    "example/index.html",
    "example/atlas/index.html",
    "example/atlas/map/index.html",
    "example/atlas/ownership/index.html",
    "example/atlas/verification/index.html",
    "example/atlas/publication/index.html",
    "example/atlas/diagnostics/index.html",
    "example/atlas/records/index.html",
    // A record's page was the walkthrough's until the Atlas's took its address (2026-11-02). The example's records
    // became the shop's on 2026-11-26; Lantern's record pages redirect to their files (build.test.ts).
    "example/BEH-RESET-PASSWORD/index.html",
  ]) {
    assert.ok(html.has(page), `${page} no longer exists`);
  }
});
