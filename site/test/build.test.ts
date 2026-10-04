import assert from "node:assert/strict";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import { after, test } from "node:test";
import {
  build,
  CONTENT_PAGES,
  EXTERNAL,
  FOOTER,
  FOOTER_LINKS,
  NAV,
  REPO,
  SCHEME_SCRIPT,
  SITE_HOST,
  SPECS,
} from "../build.ts";
import { loadRecords } from "../records.ts";

const root = resolve(import.meta.dirname, "..", "..");

/** Build once, into a temporary directory, so the suite never races dist/ against a running site:watch. */
const dist = await mkdtemp(join(tmpdir(), "intentset-site-"));
const pages = await build(dist);
const html = new Map<string, string>();
for (const page of pages) html.set(page, await readFile(join(dist, page), "utf8"));
after(async () => {
  await rm(dist, { recursive: true, force: true });
});

const records = await loadRecords(join(root, "examples", "scheduling"));

/** Visible text of a fragment of HTML. */
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

function main(page: string): string {
  const doc = html.get(page) ?? "";
  return doc.slice(doc.indexOf("<main"), doc.indexOf("</main>"));
}

test("the page list is the information architecture's, plus one page per record", () => {
  const expected = [
    ...CONTENT_PAGES.map(([path]) => path),
    ...SPECS.map((s) => `specifications/${s.slug}/index.html`),
    "example/index.html",
    ...records.map((r) => `example/${r.id}/index.html`),
  ].sort();
  assert.deepEqual([...pages].sort(), expected);
  assert.ok(records.length >= 10, "the worked example has fewer records than expected");
});

test("every internal link resolves to a page that was built, and every fragment to an id on it", async () => {
  const ids = new Map<string, Set<string>>();
  for (const [page, doc] of html) ids.set(page, new Set([...doc.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  for (const [page, doc] of html) {
    // Code blocks show example markup; the links they contain are not the site's.
    const outsideCode = doc.replace(/<pre[\s\S]*?<\/pre>/g, "");
    for (const [, href] of outsideCode.matchAll(/href="([^"]+)"/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      assert.ok(!href.startsWith("/"), `${page}: root-relative link ${href}`);
      const [path, fragment] = href.split("#");
      let target = page;
      if (path !== "") {
        target = normalize(join(dirname(page), path));
        if (target.endsWith("/")) target += "index.html";
        await access(join(dist, target)).catch(() => assert.fail(`${page}: ${href} does not resolve`));
      }
      if (fragment !== undefined && target.endsWith(".html")) {
        assert.ok(ids.get(target)?.has(fragment), `${page}: ${href} has no target id`);
      }
    }
  }
});

test("every page has exactly one h1, a skip link to main, and no script but the scheme's", () => {
  // The one script is the shell's, and all it does is remember the reader's
  // color scheme across pages, as markset.org's does. It sits ahead of the
  // header; nothing inside <main>, which is rendered from a document, has one.
  for (const [page, doc] of html) {
    assert.equal((doc.match(/<h1[\s>]/g) ?? []).length, 1, `${page}: h1 count`);
    assert.match(doc, /<a class="site-skip" href="#main">Skip to content<\/a>/, page);
    assert.match(doc, /<main id="main" class="ms-document" tabindex="-1">/, page);
    assert.equal((doc.match(/<script/gi) ?? []).length, 1, `${page}: one script`);
    assert.ok(doc.includes(SCHEME_SCRIPT), `${page}: and it is the scheme script`);
    assert.ok(doc.indexOf(SCHEME_SCRIPT) < doc.indexOf('<header class="site-header">'), `${page}: ahead of the header`);
    assert.doesNotMatch(doc.slice(doc.indexOf("<main"), doc.indexOf("</main>")), /<script/i, page);
    assert.doesNotMatch(doc, /<form/i, page);
    assert.match(doc, /<html lang="en">/, page);
    assert.match(doc, /<meta name="viewport" content="width=device-width, initial-scale=1">/, page);
  }
});

test("the navigation carries the IA's four items and Start, and the footer its links, with their copy", () => {
  for (const [page, doc] of html) {
    const nav = doc.slice(doc.indexOf('<nav class="site-nav"'), doc.indexOf("</nav>"));
    const labels = [...nav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    assert.deepEqual(
      labels,
      NAV.map(([label]) => label),
      page,
    );
    assert.deepEqual(labels, ["How it works", "Start", "Specifications", "Markset", "Roadmap"]);
    assert.match(nav, /href="(\.\/|(\.\.\/)+)how-it-works\/index\.html"/, `${page}: How it works is a page`);
    const footer = doc.slice(doc.indexOf("<footer"), doc.indexOf("</footer>"));
    const footerNav = footer.slice(0, footer.indexOf("</nav>"));
    assert.deepEqual(
      [...footerNav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]),
      FOOTER_LINKS.map(([label]) => label),
      page,
    );
    assert.ok(text(footer).includes(FOOTER.statement), page);
    assert.ok(text(footer).includes(FOOTER.independence), page);
    assert.match(footer, new RegExp(`<a href="${REPO}">${FOOTER.repository}</a>`), page);
  }
});

test("tab titles follow the family's pattern: the home page names Intentset first, every other page last", () => {
  assert.match(html.get("index.html") ?? "", /<title>Intentset · Keep control of what your agents build<\/title>/);
  for (const [page, doc] of html) {
    if (page === "index.html") continue;
    assert.match(doc, /<title>[^<]*[^.] · Intentset<\/title>/, page);
  }
});

test("How it works is a page of its own, with a contents rail, and the home page leads to it", () => {
  const page = html.get("how-it-works/index.html") ?? "";
  assert.match(page, /<aside class="site-toc">/, "the explanation has a contents rail");
  assert.match(
    page,
    /<nav class="site-nav"[\s\S]*?<a href="\.\.\/how-it-works\/index\.html" aria-current="page">How it works<\/a>/,
  );
  const home = main("index.html");
  assert.match(home, /<span class="ms-span button primary"><a href="how-it-works\/index\.html">See how it works<\/a>/);
  assert.doesNotMatch(html.get("index.html") ?? "", /index\.html#how/, "nothing points at the old anchor");
});

test("the header carries the color-scheme control, and the footer the family's mark", () => {
  for (const [page, doc] of html) {
    const header = doc.slice(doc.indexOf('<header class="site-header">'), doc.indexOf("</header>"));
    assert.match(header, /<div class="site-scheme" role="group" aria-label="Color scheme">/, page);
    for (const name of ["Auto", "Light", "Dark"]) assert.ok(header.includes(`>${name}</span>`), `${page}: ${name}`);
    assert.match(header, /id="ms-scheme-auto" class="site-scheme-input" checked/, `${page}: auto by default`);
    const footer = doc.slice(doc.indexOf("<footer"), doc.indexOf("</footer>"));
    assert.match(footer, /<svg class="site-family"[^>]*aria-hidden="true"/, `${page}: the mark is decoration`);
  }
});

test("CNAME names the homepage's host, and the shell links the two stylesheets relative to the page", async () => {
  assert.equal(await readFile(join(dist, "CNAME"), "utf8"), `${SITE_HOST}\n`);
  assert.equal(SITE_HOST, "intentset.org");
  for (const [page, doc] of html) {
    const depth = page.split("/").length - 1;
    const up = depth === 0 ? "./" : "../".repeat(depth);
    assert.ok(doc.includes(`<link rel="stylesheet" href="${up}css/markset.css">`), page);
    assert.ok(doc.includes(`<link rel="stylesheet" href="${up}css/site.css">`), page);
    assert.ok(doc.includes(`<link rel="icon" type="image/svg+xml" href="${up}icon.svg">`), page);
  }
  await access(join(dist, "css", "markset.css"));
  await access(join(dist, "icon.svg"));
  // Nothing loaded from another origin: the IA names no external dependencies.
  for (const css of ["site.css", "markset.css"]) {
    const source = await readFile(join(dist, "css", css), "utf8");
    assert.doesNotMatch(source, /@import|@font-face|url\(["']?(https?:)?\/\//, css);
  }
});

test("every install command on the site names a published package of this repository", async () => {
  // Flipped in M5, 2026-10-03, when 0.1.0 reached npm. Before then no page could
  // name an install path; now each @intentset package a page names must be one
  // this repository publishes, so the site cannot point at a package that is not.
  const published = new Set<string>();
  for (const dir of await readdir(join(root, "packages"))) {
    const manifest = JSON.parse(await readFile(join(root, "packages", dir, "package.json"), "utf8"));
    if (!manifest.private) published.add(manifest.name);
  }
  let named = 0;
  for (const [page, doc] of html) {
    const body = text(doc.slice(doc.indexOf("<body")));
    for (const m of body.matchAll(/(?:npm install|pnpm add)[^@]*(@intentset\/[a-z-]+)/g)) {
      named++;
      assert.ok(
        published.has(m[1]),
        `${page} tells readers to install ${m[1]}, which this repository does not publish`,
      );
    }
  }
  assert.ok(named > 0, "the Start page names the package to install");
});

test("the only destinations outside the site are the repository, Markset, Coral Reef and the profile's references", () => {
  const allowed = new Set([
    new URL(REPO).host,
    SITE_HOST,
    new URL(EXTERNAL.markset).host,
    new URL(EXTERNAL.coralReef).host,
    // Cited by the reference profile, rendered from its source.
    "www.typescriptlang.org",
    "docs.amplify.aws",
  ]);
  for (const [page, doc] of html) {
    for (const [, href] of doc.matchAll(/href="(https?:[^"]+)"/g)) {
      assert.ok(allowed.has(new URL(href).host), `${page}: unexpected destination ${href}`);
    }
  }
  assert.match(html.get("markset/index.html") ?? "", new RegExp(`href="${EXTERNAL.markset}"`));
  assert.match(html.get("about/index.html") ?? "", new RegExp(`href="${EXTERNAL.coralReef}"`));
  assert.match(html.get("roadmap/index.html") ?? "", new RegExp(`href="${REPO}">Contribute on GitHub`));
});

/** The headings a Markdown source declares, outside code fences, as the text a reader sees. */
async function sourceHeadings(file: string): Promise<string[]> {
  const source = await readFile(join(root, file), "utf8");
  const out: string[] = [];
  let fenced = false;
  for (const line of source.split("\n")) {
    if (/^```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push(text(m[1].replace(/[`*_]/g, "")));
  }
  return out;
}

function renderedHeadings(page: string): string[] {
  return [...main(page).matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)].map((m) => text(m[1]));
}

test("the specification pages carry exactly the headings their source files declare, in order, with a contents rail", async () => {
  const docs = SPECS.map((s) => [`specifications/${s.slug}/index.html`, join("spec", s.file)]);
  for (const [page, file] of docs) {
    assert.deepEqual(renderedHeadings(page), await sourceHeadings(file), page);
    const doc = html.get(page) ?? "";
    assert.match(doc, /<aside class="site-toc"><nav aria-label="Contents">/, page);
    const toc = doc.slice(doc.indexOf("<aside"), doc.indexOf("</aside>"));
    const entries = [...toc.matchAll(/<a href="#([^"]+)">/g)].map((m) => m[1]);
    // The publication profile is the shortest, at four sections.
    assert.ok(entries.length >= 4, `${page}: rail has ${entries.length} entries`);
    for (const id of entries)
      assert.ok(doc.includes(`<h2 id="${id}">`) || doc.includes(`<h3 id="${id}">`), `${page}: #${id}`);
    assert.match(doc, new RegExp(`<a href="${REPO}/blob/main/${file}">`), `${page}: names its source`);
  }
  // Links between the documents are links between their pages.
  const core = html.get("specifications/core/index.html") ?? "";
  assert.match(core, /href="\.\.\/vsa\/index\.html"/);
  assert.match(core, /href="\.\.\/profile-typescript-amplify-gen2\/index\.html"/);
  // The one .md link left is the banner's, to the source in the repository.
  assert.doesNotMatch(core, /href="(?!https?:)[^"]*\.md"/, "a .md link survived into the core page");
});

test("the example index lists every record under its type, and each record page carries its metadata and links", () => {
  const index = main("example/index.html");
  const types = [...index.matchAll(/<h2 id="[^"]+">([^<]+)<\/h2>/g)].map((m) => m[1].toLowerCase());
  for (const record of records) {
    assert.ok(types.includes(record.type), `index has no ${record.type} group`);
    assert.match(index, new RegExp(`<a href="${record.id}/index.html">${record.id}</a> — ${record.title}`));
    assert.ok(text(index).includes(record.status));
    const page = main(`example/${record.id}/index.html`);
    const card = page.slice(page.indexOf('<section class="ms-card record"'), page.indexOf("</section>"));
    const cardText = text(card);
    for (const value of [record.id, record.type, record.status, record.owner, record.visibility, ...record.audiences]) {
      assert.ok(cardText.includes(value), `${record.id}: card lacks ${value}`);
    }
    for (const target of [...(record.parent ? [record.parent] : []), ...record.links.flatMap(([, ids]) => ids)]) {
      assert.match(
        card,
        new RegExp(`<a href="\\.\\./${target}/index\\.html">${target}</a>`),
        `${record.id}: ${target}`,
      );
    }
    // The body is rendered, the frontmatter is not.
    assert.match(page, new RegExp(`<h1 id="[^"]+">${record.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`));
    assert.doesNotMatch(page, /intentset:\s*\n\s*spec:/, `${record.id}: frontmatter leaked into the page`);
    assert.doesNotMatch(page, /<pre/, `${record.id}: frontmatter rendered as a code block`);
  }
  // Nothing on the example claims a running system or passing evidence.
  assert.ok(text(index).includes("No running product, passing evidence, or publication is claimed."));
});

test("home: the hero, the loop, the role cards, the worked example and status are the constructs the layout asks for", () => {
  const home = main("index.html");
  assert.match(home, /<div class="ms-columns hero"/);
  assert.match(home, /<section class="ms-card example"/);
  assert.match(home, /<div class="ms-grid" data-cols="2"/);
  const roles = [...home.matchAll(/<h3 class="ms-card-title">(For [^<]+)<\/h3>\s*<ul>([\s\S]*?)<\/ul>/g)];
  assert.deepEqual(
    roles.map((m) => m[1]),
    ["For product managers", "For engineers", "For customer knowledge", "For agents"],
  );
  for (const [, role, list] of roles) {
    const questions = [...list.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
    assert.equal(questions.length, 3, role);
    assert.ok(
      questions.every((q) => q.endsWith("?")),
      `${role}: every item is a question the model can answer`,
    );
  }
  assert.match(home, /<a href="pilot\/index\.html">/, "the home page leads to the pilot");
  assert.match(home, /<ol class="ms-steps adopt">/);
  assert.match(home, /<section class="ms-card status"/);
  assert.match(home, /<div class="ms-callout" data-type="note"/);
  assert.match(home, /<h2 id="example">/);
  assert.match(
    home,
    /<span class="ms-span button"><a href="specifications\/index\.html">Read the draft specification<\/a>/,
  );
});

test("the build leaves no placeholder behind", async () => {
  for (const [page, doc] of html) {
    assert.doesNotMatch(doc, /\{\{\w+\}\}/, page);
    assert.doesNotMatch(doc, /lorem|TODO/i, page);
  }
  const written = await readdir(dist);
  assert.ok(!written.some((name) => name.includes("staging")), "a staging directory was left in dist");
});
