import assert from "node:assert/strict";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import { after, test } from "node:test";
import { build, CONTENT_PAGES, EXTERNAL, FOOTER, FOOTER_LINKS, NAV, REPO, SITE_HOST, SPECS } from "../build.ts";
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
    "roadmap/implementation/index.html",
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

test("every page has exactly one h1, a skip link to main, and no script", () => {
  for (const [page, doc] of html) {
    assert.equal((doc.match(/<h1[\s>]/g) ?? []).length, 1, `${page}: h1 count`);
    assert.match(doc, /<a class="site-skip" href="#main">Skip to content<\/a>/, page);
    assert.match(doc, /<main id="main" class="ms-document" tabindex="-1">/, page);
    assert.doesNotMatch(doc, /<script/i, page);
    assert.doesNotMatch(doc, /<form/i, page);
    assert.match(doc, /<html lang="en">/, page);
    assert.match(doc, /<meta name="viewport" content="width=device-width, initial-scale=1">/, page);
  }
});

test("the navigation carries the four items the IA names, and the footer its five, with their copy", () => {
  for (const [page, doc] of html) {
    const nav = doc.slice(doc.indexOf('<nav class="site-nav"'), doc.indexOf("</nav>"));
    const labels = [...nav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    assert.deepEqual(
      labels,
      NAV.map(([label]) => label),
      page,
    );
    assert.deepEqual(labels, ["How it works", "Specifications", "Markset", "Roadmap"]);
    assert.match(nav, /href="(\.\/|(\.\.\/)+)index\.html#how"/, `${page}: How it works is the home anchor`);
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
  assert.match(html.get("index.html") ?? "", /<h2 id="how">/, "the How it works anchor exists");
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

test("no page claims an install path: the toolchain is not shipped (flipped in M5)", () => {
  for (const [page, doc] of html) {
    const body = text(doc.slice(doc.indexOf("<body")));
    assert.doesNotMatch(body, /npm install/i, page);
    assert.doesNotMatch(body, /npx intentset/i, page);
  }
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
  const docs = [
    ...SPECS.map((s) => [`specifications/${s.slug}/index.html`, join("spec", s.file)]),
    ["roadmap/implementation/index.html", "docs/requirements/roadmap/05-implementation-roadmap.md"],
  ];
  for (const [page, file] of docs) {
    assert.deepEqual(renderedHeadings(page), await sourceHeadings(file), page);
    const doc = html.get(page) ?? "";
    assert.match(doc, /<aside class="site-toc"><nav aria-label="Contents">/, page);
    const toc = doc.slice(doc.indexOf("<aside"), doc.indexOf("</aside>"));
    const entries = [...toc.matchAll(/<a href="#([^"]+)">/g)].map((m) => m[1]);
    assert.ok(entries.length >= 5, `${page}: rail has ${entries.length} entries`);
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

test("home: the hero, worked example, audience cards, adoption steps and status are the constructs the layout asks for", () => {
  const home = main("index.html");
  assert.match(home, /<div class="ms-columns hero"/);
  assert.match(home, /<section class="ms-card example"/);
  assert.match(home, /<div class="ms-grid" data-cols="3"/);
  assert.equal(
    (home.match(/<section class="ms-card" data-tone="neutral">\n<h3 class="ms-card-title">For /g) ?? []).length,
    3,
  );
  assert.match(home, /<ol class="ms-steps adopt">/);
  assert.match(home, /<section class="ms-card status"/);
  assert.match(home, /<div class="ms-callout" data-type="note"/);
  assert.match(home, /<h2 id="example">/);
  assert.match(
    home,
    /<span class="ms-span button primary"><a href="specifications\/index\.html">Read the draft specification<\/a>/,
  );
  assert.match(home, /<span class="ms-span button"><a href="#example">Explore an example<\/a>/);
});

test("the build leaves no placeholder behind", async () => {
  for (const [page, doc] of html) {
    assert.doesNotMatch(doc, /\{\{\w+\}\}/, page);
    assert.doesNotMatch(doc, /lorem|TODO/i, page);
  }
  const written = await readdir(dist);
  assert.ok(!written.some((name) => name.includes("staging")), "a staging directory was left in dist");
});
