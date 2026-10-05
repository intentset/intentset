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
import { dirname, join, normalize } from "node:path";
import { after, test } from "node:test";
import { build, FOOTER_LINKS, NAV, NOT_FOUND, RAILS, railFor } from "../build.ts";

const dist = await mkdtemp(join(tmpdir(), "intentset-rail-"));
const pages = await build(dist);
const html = new Map<string, string>();
for (const page of pages) html.set(page, await readFile(join(dist, page), "utf8"));
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

/** The pages a page links to, by output path, from anywhere on it: bar, rail, body and footer. */
function linksFrom(page: string): Set<string> {
  const out = new Set<string>();
  for (const [, href] of (html.get(page) ?? "").matchAll(/href="([^"#?]*)/g)) {
    if (href === "" || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const target = href.startsWith("/") ? normalize(href.slice(1)) : normalize(join(dirname(page), href));
    if (html.has(target) && target !== page) out.add(target);
  }
  return out;
}

/** The hrefs of the section rail on a page, as output paths. */
function rail(page: string): string[] {
  const nav = /<nav class="site-rail"[^>]*>([\s\S]*?)<\/nav>/.exec(html.get(page) ?? "");
  if (!nav) return [];
  return [...nav[1].matchAll(/<a href="([^"]*)"/g)].map((m) => normalize(join(dirname(page), m[1])));
}

test("every URL the site had before the bar changed still answers", () => {
  // The bar changed on 2026-10-05 and no page moved: Reference is the
  // specifications index, Examples the worked example's, and the Markset page
  // and How it works kept their addresses inside a rail.
  for (const page of [
    "index.html",
    "how-it-works/index.html",
    "start/index.html",
    "pilot/index.html",
    "specifications/index.html",
    "specifications/core/index.html",
    "specifications/vsa/index.html",
    "specifications/profile-typescript-amplify-gen2/index.html",
    "specifications/publication/index.html",
    "specifications/export/index.html",
    "markset/index.html",
    "roadmap/index.html",
    "about/index.html",
    "example/index.html",
    "example/BEH-ASMT-SCHEDULE/index.html",
  ]) {
    assert.ok(html.has(page), `${page} no longer exists`);
  }
});

test("every page is named by the bar, a rail or the footer's row, or is a record the worked example lists", () => {
  const named = new Set([...NAV, ...FOOTER_LINKS, ...RAILS.flatMap((r) => r.items)].map(([, href]) => href));
  const examples = linksFrom("example/index.html");
  for (const page of pages) {
    // Home is the wordmark, on every page.
    if (page === NOT_FOUND || page === "index.html") continue;
    if (named.has(page)) continue;
    assert.ok(
      page.startsWith("example/") && examples.has(page),
      `${page} is reachable only from a sentence: give it a place in a rail`,
    );
  }
  // Every rail entry is a page that was built.
  for (const { title, items } of RAILS) {
    for (const [label, href] of items) assert.ok(html.has(href), `${title} rail: ${label} (${href}) was not built`);
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
    const section = railFor(page);
    const doc = html.get(page) ?? "";
    const bar = doc.slice(doc.indexOf('<nav class="site-nav"'), doc.indexOf("</nav>"));
    const current = [...bar.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    if (!section) {
      assert.deepEqual(rail(page), [], `${page} belongs to no section and has a rail`);
      continue;
    }
    assert.deepEqual(
      rail(page),
      section.items.map(([, href]) => href),
      `${page}: the ${section.title} rail`,
    );
    const nav = /<nav class="site-rail"[^>]*>([\s\S]*?)<\/nav>/.exec(doc)?.[1] ?? "";
    const marked = (nav.match(/aria-current="page"/g) ?? []).length;
    // A record of the worked example is in the section without being in its list.
    assert.equal(marked, section.items.some(([, href]) => href === page) ? 1 : 0, `${page}: rail marks ${marked}`);
    const barLabel = NAV.find(([, href]) => href === section.items[0][1])?.[0];
    assert.deepEqual(current, [barLabel], `${page}: the bar marks ${current.join(", ") || "nothing"}`);
  }
  // Each bar item but Roadmap opens its section's rail.
  assert.deepEqual(
    RAILS.map((r) => r.items[0][1]),
    NAV.filter(([label]) => label !== "Roadmap").map(([, href]) => href),
  );
});

test("Reference holds the specifications, the Markset page and conformance; Tools the command; Start the guide", () => {
  const reference = RAILS.find((r) => r.title === "Reference")?.items.map(([, href]) => href) ?? [];
  for (const page of ["specifications/core/index.html", "markset/index.html", "conformance/index.html"]) {
    assert.ok(reference.includes(page), `Reference lacks ${page}`);
  }
  assert.ok(RAILS.find((r) => r.title === "Tools")?.items.some(([, href]) => href === "tools/cli/index.html"));
  const start = RAILS.find((r) => r.title === "Start")?.items.map(([, href]) => href) ?? [];
  assert.deepEqual(start, ["start/index.html", "how-it-works/index.html", "guide/index.html"]);
});
