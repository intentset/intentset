import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import { after, test } from "node:test";
import {
  ASK_URL,
  build,
  CHAT_PAGES,
  CARD,
  CANONICAL,
  CARD_ALT,
  cardUrl,
  CONTENT_PAGES,
  cardTitle,
  EXTERNAL,
  FOOTER,
  FOOTER_LINKS,
  INTRODUCTION,
  NAV,
  NOT_FOUND,
  COPY_SCRIPT,
  EXAMPLE_ACTS,
  EXAMPLE_DIR,
  REDIRECTS,
  readSpecMeta,
  REPO,
  SCHEME_SCRIPT,
  SIBLING,
  SITE_HOST,
  SPEC_META_KEYS,
  SPECS,
  termTips,
} from "../build.ts";
import { ATLAS_ROOT, atlasRecordPath, EXAMPLE_TIMES } from "../example-atlas.ts";
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

const records = await loadRecords(join(root, EXAMPLE_DIR));

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

test("the page list is the content pages, the specifications, the guide, conformance, the changelog and the example's one page", () => {
  const expected = [
    ...CONTENT_PAGES.map(([path]) => path),
    // The privacy page, once the chat is launched.
    ...(ASK_URL === null ? [] : CHAT_PAGES.map(([path]) => path)),
    ...SPECS.map((s) => `specifications/${s.slug}/index.html`),
    "guide/index.html",
    "conformance/index.html",
    "changelog/index.html",
    "example/index.html",
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
    for (const [, href] of outsideCode.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      // Pages serves the 404 page at whatever address was missing, so its links
      // start at the root and every other page's are relative.
      if (page === NOT_FOUND) assert.ok(/^\/|^#/.test(href), `${page}: relative link ${href}`);
      else assert.ok(!href.startsWith("/"), `${page}: root-relative link ${href}`);
      const [path, fragment] = href.split("#");
      let target = page;
      if (path !== "") {
        target = path.startsWith("/") ? normalize(path.slice(1)) : normalize(join(dirname(page), path));
        if (target.endsWith("/")) target += "index.html";
        await access(join(dist, target)).catch(() => assert.fail(`${page}: ${href} does not resolve`));
      }
      if (fragment !== undefined && target.endsWith(".html")) {
        assert.ok(ids.get(target)?.has(fragment), `${page}: ${href} has no target id`);
      }
    }
  }
});

test("every page carries a Content Security Policy that allows its own inline scripts by hash and only the chat's origin", () => {
  for (const [page, doc] of html) {
    const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/
      .exec(doc)?.[1]
      .replaceAll("&#39;", "'");
    assert.ok(policy, `${page}: has a policy`);
    assert.ok(doc.indexOf("Content-Security-Policy") < doc.indexOf("<script"), `${page}: ahead of every script`);
    const directives = new Map(policy.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));
    assert.deepEqual(directives.get("default-src"), ["'none'"], page);
    for (const [, body] of doc.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      const hash = `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
      assert.ok(directives.get("script-src")?.includes(hash), `${page}: an inline script is allowed by its hash`);
    }
    assert.ok(!directives.get("script-src")?.includes("'unsafe-inline'"), page);
    assert.deepEqual(
      directives.get("connect-src"),
      ["'self'", ...(ASK_URL === null ? [] : [new URL(ASK_URL).origin])],
      `${page}: the chat's origin is the one other the page may call`,
    );
    assert.match(doc, /<meta name="referrer" content="strict-origin-when-cross-origin">/, page);
  }
});

test("every page has exactly one h1, a skip link to main, and no script but the shell's two, the chat's, the Atlas map's and the deck's", () => {
  // Both scripts are the shell's: one remembers the reader's color scheme across
  // pages, as markset.org's does, and one puts a Copy button on each code block.
  // They sit ahead of the header; nothing inside <main>, which is rendered from a
  // document, has one, and neither is rendered from a document.
  for (const [page, doc] of html) {
    assert.equal((doc.match(/<h1[\s>]/g) ?? []).length, 1, `${page}: h1 count`);
    assert.match(doc, /<a class="site-skip" href="#main">Skip to content<\/a>/, page);
    assert.match(doc, /<main id="main" class="ms-document" tabindex="-1">/, page);
    // The chat panel's, after </main>, once the chat is launched (chat.test.ts drives it).
    // The introduction loads Present after </main> the same way.
    const deck = page === INTRODUCTION.page;
    if (deck)
      assert.ok(doc.indexOf(`${INTRODUCTION.script}" defer>`) > doc.indexOf("</main>"), "the deck's script after main");
    assert.equal(
      (doc.match(/<script/gi) ?? []).length,
      (ASK_URL === null ? 2 : 3) + (deck ? 1 : 0),
      `${page}: the shell's scripts`,
    );
    if (ASK_URL !== null)
      assert.ok(
        doc.indexOf('chat/panel.js" data-ask-url=') > doc.indexOf("</main>"),
        `${page}: the chat's script after main`,
      );
    assert.ok(doc.includes(SCHEME_SCRIPT), `${page}: and one is the scheme script`);
    assert.ok(doc.includes(COPY_SCRIPT), `${page}: and one is the copy script`);
    assert.ok(doc.indexOf(SCHEME_SCRIPT) < doc.indexOf('<header class="site-header">'), `${page}: ahead of the header`);
    assert.ok(doc.indexOf(COPY_SCRIPT) < doc.indexOf('<header class="site-header">'), `${page}: ahead of the header`);
    assert.doesNotMatch(doc.slice(doc.indexOf("<main"), doc.indexOf("</main>")), /<script/i, page);
    assert.doesNotMatch(doc, /<form/i, page);
    assert.match(doc, /<html lang="en">/, page);
    assert.match(doc, /<meta name="viewport" content="width=device-width, initial-scale=1">/, page);
  }
});

test("the bar is the three sections by what a reader came to do", () => {
  for (const [page, doc] of html) {
    const nav = doc.slice(doc.indexOf('<nav class="site-nav"'), doc.indexOf("</nav>"));
    const labels = [...nav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    assert.deepEqual(
      labels,
      NAV.map(([label]) => label),
      page,
    );
    assert.deepEqual(labels, ["How it works", "Get started", "Reference"]);
    assert.doesNotMatch(doc, /On this page/, `${page} has a contents rail`);
  }
});

test("the footer is the family's: the bar, the slides and About, then one line, then the family's mark", () => {
  // Decided 2026-10-06 for both product sites: a row of links, then one line
  // naming the product, what it is, its source, the company and the sibling.
  assert.equal(FOOTER.statement, "Keep control of what your agents build.");
  assert.equal(FOOTER.repository, "Source on GitHub");
  assert.equal(FOOTER.company, "A Coral Reef Ventures project");
  assert.equal(SIBLING.url, EXTERNAL.markset);
  const line =
    `<p><strong>Intentset</strong> · ${FOOTER.statement}` +
    ` · <a href="${REPO}">${FOOTER.repository}</a>` +
    ` · <a href="${EXTERNAL.coralReef}">${FOOTER.company}</a>` +
    ` · Sibling project: <a href="${SIBLING.url}">${SIBLING.name}</a></p>`;
  for (const [page, doc] of html) {
    const footer = doc.slice(doc.indexOf('<footer class="site-footer">'), doc.indexOf("</footer>"));
    const navStart = footer.indexOf('<nav class="site-footer-nav" aria-label="Footer">');
    assert.notEqual(navStart, -1, `${page}: the footer has its row`);
    const footerNav = footer.slice(navStart, footer.indexOf("</nav>"));
    assert.deepEqual(
      [...footerNav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]),
      [...FOOTER_LINKS.map(([label]) => label), ...(ASK_URL === null ? [] : ["Privacy"])],
      page,
    );
    assert.deepEqual(
      [...footerNav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]),
      ["How it works", "Get started", "Reference", "Slides", "About", ...(ASK_URL === null ? [] : ["Privacy"])],
      `${page}: About stays in the footer's row`,
    );
    const afterNav = footer.slice(footer.indexOf("</nav>") + "</nav>".length);
    assert.equal((afterNav.match(/<p[\s>]/g) ?? []).length, 1, `${page}: one line`);
    assert.ok(afterNav.includes(line), `${page}: the line, in order`);
    assert.ok(afterNav.indexOf(line) < afterNav.indexOf('<svg class="site-family"'), `${page}: the mark comes last`);
    assert.doesNotMatch(
      text(footer),
      /adopted independently/i,
      `${page}: the footer makes no claim about adopting the products separately`,
    );
  }
});

test("tab titles follow the family's pattern: the home page names Intentset first, every other page last", () => {
  assert.match(html.get("index.html") ?? "", /<title>Intentset · Keep control of what your agents build<\/title>/);
  for (const [page, doc] of html) {
    if (page === "index.html") continue;
    assert.match(doc, /<title>[^<]*[^.] · Intentset<\/title>/, page);
  }
});

test("How it works is in the bar, with the example in its rail, and the home page leads to it", () => {
  const page = html.get("how-it-works/index.html") ?? "";
  // "On this page" left every page the site writes from site/content on 2026-11-26 (the user's decision).
  assert.doesNotMatch(page, /<nav aria-label="Contents">/, "no contents rail");
  assert.match(
    page,
    /<nav class="site-rail" aria-label="How it works">[\s\S]*?<a href="\.\.\/example\/">The shop.s model, record by record<\/a>/,
    "the rail leads to the example",
  );
  assert.match(
    page,
    /<nav class="site-nav"[\s\S]*?<a href="\.\.\/how-it-works\/" aria-current="page">How it works<\/a>/,
  );
  const home = main("index.html");
  assert.match(home, /<span class="ms-span button primary"><a href="how-it-works\/">See how it works<\/a>/);
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
    const up = page === NOT_FOUND ? "/" : depth === 0 ? "./" : "../".repeat(depth);
    assert.ok(doc.includes(`<link rel="stylesheet" href="${up}css/markset.css">`), page);
    assert.ok(doc.includes(`<link rel="stylesheet" href="${up}css/site.css">`), page);
    assert.ok(doc.includes(`<link rel="icon" type="image/svg+xml" href="${up}icon.svg">`), page);
  }
  await access(join(dist, "css", "markset.css"));
  await access(join(dist, "icon.svg"));
  // Nothing loaded from another origin: the IA names no external dependencies.
  for (const css of ["site.css", "markset.css", "deck.css"]) {
    const source = await readFile(join(dist, "css", css), "utf8");
    assert.doesNotMatch(source, /@import|@font-face|url\(["']?(https?:)?\/\//, css);
  }
});

test("every install command on the site names a published package of this repository", async () => {
  // Flipped in M5, 2026-10-03, when 0.1.0 reached npm. Before then no page could
  // name an install path; now each @intentset package a page names must be one
  // this repository publishes, so the site cannot point at a package that is not.
  const published = new Set<string>();
  // Directories only: a workspace folder holds whatever the machine leaves in it
  // (macOS writes .DS_Store on any Finder visit), and a stray file is not a package.
  for (const entry of await readdir(join(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = JSON.parse(await readFile(join(root, "packages", entry.name, "package.json"), "utf8"));
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
    // The convention the changelog's summary follows, linked from its preamble.
    "keepachangelog.com",
  ]);
  for (const [page, doc] of html) {
    for (const [, href] of doc.matchAll(/href="(https?:[^"]+)"/g)) {
      assert.ok(allowed.has(new URL(href).host), `${page}: unexpected destination ${href}`);
    }
  }
  assert.match(html.get("glossary/index.html") ?? "", new RegExp(`href="${EXTERNAL.markset}"`));
  assert.match(html.get("about/index.html") ?? "", new RegExp(`href="${EXTERNAL.coralReef}"`));
});

/** The deck's slides, in its order (decided 2026-10-26: published here, in Markset, rather than linked on claude.ai). */
const DECK = ["cover", "problem", "trust", "idea", "review", "value", "loop", "fits", "adopt", "try"];

test("the introduction is a deck of 10 slides in order, each with its notes folded beneath it, on its own theme", async () => {
  const page = html.get(INTRODUCTION.page) ?? "";
  const body = main(INTRODUCTION.page);
  assert.match(page, /<title>Introducing Intentset · Intentset<\/title>/);
  assert.match(body, /<h1 id="introducing-intentset">Introducing Intentset<\/h1>/);
  const description = /<meta name="description" content="([^"]+)">/.exec(page)?.[1] ?? "";
  assert.ok(description.startsWith("What Intentset is, what it gives a team"), description);
  // A slide is a card carrying .slide, and what follows it is its notes, a folded NOTE callout: in document order
  // the two alternate, a slide and then its notes, once per slide.
  const order = [
    ...body.matchAll(
      /<section class="ms-card slide[^"]*" id="([^"]+)"|<details class="ms-callout notes" data-type="note">\n<summary class="ms-callout-title">Speaker notes<\/summary>/g,
    ),
  ].map((m) => m[1] ?? "notes");
  assert.deepEqual(
    order,
    DECK.flatMap((id) => [id, "notes"]),
  );
  // The four parts each open on their first slide.
  for (const id of ["problem", "idea", "value", "adopt"]) assert.ok(body.includes(`href="#${id}"`), id);
  // The example is Home's password reset (2026-11-26). A pass is never said to
  // count only on this commit (SL-710).
  assert.ok(text(body).includes("A password reset link stops working one hour after it is sent."));
  assert.ok(!text(body).includes("Lantern"), "the deck tells Home's example, not Lantern");
  assert.ok(!/on this commit/.test(text(body)), "no pass is bound to this commit");
  // Every picture its theme draws is published beside it.
  const theme = await readFile(join(dist, INTRODUCTION.stylesheet), "utf8");
  const pictures = [...theme.matchAll(/url\("\.\.\/([^"]+)"\)/g)].map((m) => m[1] ?? "");
  assert.ok(pictures.filter((p) => p.startsWith(`${INTRODUCTION.pictures}/`)).length === 3, pictures.join());
  for (const picture of pictures) await access(join(dist, picture));
  // Its theme is this page's alone, and like every stylesheet here it loads nothing from another origin.
  assert.ok(page.includes(`<link rel="stylesheet" href="../${INTRODUCTION.stylesheet}">`));
  for (const [other, doc] of html)
    if (other !== INTRODUCTION.page) assert.ok(!doc.includes(INTRODUCTION.stylesheet), other);
  // Ids are unique on the page, so every slide and every heading can be linked.
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, [...new Set(ids)], "no id is repeated");
  // Nothing on it leaves the site: its links are to the site's own pages and its own slides.
  for (const [, href] of body.matchAll(/href="([^"]+)"/g)) assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(href), href);
});

test("the slide deck is in the footer's row and nowhere in a page's body (2026-11-26, the user's decision)", () => {
  for (const [page, doc] of html) {
    if (page === INTRODUCTION.page) continue;
    const body = doc.slice(doc.indexOf("<main"), doc.indexOf("</main>"));
    assert.doesNotMatch(body, /href="(?:\.\.\/)*introducing\/"/, `${page} leads to the deck from its body`);
    const footer = doc.slice(doc.indexOf('<footer class="site-footer">'));
    assert.match(
      footer,
      /href="(?:\/|\.\/|(?:\.\.\/)*)introducing\/">Slides<\/a>/,
      `${page}: the footer's row has the deck`,
    );
  }
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

test("the specification pages carry exactly the headings their source files declare, in order, with no contents rail", async () => {
  const docs = SPECS.map((s) => [`specifications/${s.slug}/index.html`, join("spec", s.file)]);
  for (const [page, file] of docs) {
    assert.deepEqual(renderedHeadings(page), await sourceHeadings(file), page);
    const doc = html.get(page) ?? "";
    assert.match(doc, /<aside class="site-toc"><nav class="site-rail" aria-label="Reference">/, page);
    // "On this page" left the whole site on 2026-11-26 (the user's decision).
    assert.doesNotMatch(doc, /On this page|<nav aria-label="Contents">/, page);
    assert.match(doc, new RegExp(`<a href="${REPO}/blob/main/${file}">`), `${page}: names its source`);
  }
  // Links between the documents are links between their pages.
  const core = html.get("specifications/core/index.html") ?? "";
  assert.match(core, /href="\.\.\/vsa\/"/);
  assert.match(core, /href="\.\.\/profile-typescript-amplify-gen2\/"/);
  // The one .md link left is the banner's, to the source in the repository.
  assert.doesNotMatch(core, /href="(?!https?:)[^"]*\.md"/, "a .md link survived into the core page");
});

/**
 * Each specification says what it is in its frontmatter (Core §1's change
 * policy), and the site renders the banner and the index cards from it rather
 * than from a copy. Before 2026-10-05 the banners were hand-written in each
 * document, and Core's still said 2026-10-02 two revisions later.
 */
test("each specification's frontmatter names it, and its page and index card show what it says", async () => {
  const version = (JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string }).version;
  const index = main("specifications/index.html");
  const today = new Date().toISOString().slice(0, 10);
  const ids = new Set<string>();
  for (const spec of SPECS) {
    const file = join("spec", spec.file);
    const source = await readFile(join(root, file), "utf8");
    assert.match(source, /^---\n/u, `${file} opens with frontmatter`);
    const meta = readSpecMeta(source, file);
    const keys = Object.keys(meta).sort();
    assert.deepEqual(
      keys,
      [...SPEC_META_KEYS].sort(),
      `${file}: frontmatter carries exactly ${SPEC_META_KEYS.join(", ")}`,
    );

    const h1 = /^# (.+)$/mu.exec(source)?.[1];
    assert.equal(meta.title, h1, `${file}: title is the document's heading`);
    assert.match(meta.id, /^intentset\/[a-z0-9-]+\/\d+\.\d+$/u, `${file}: id`);
    assert.ok(!ids.has(meta.id), `${file}: id ${meta.id} is taken`);
    ids.add(meta.id);
    assert.ok(meta.title.endsWith(` v${meta.id.split("/").at(-1)}`), `${file}: title and id name one version`);
    assert.equal(meta.status, "draft", `${file}: every specification is a draft until Core §1 says otherwise`);
    assert.match(meta.revision, /^\d{4}-\d{2}-\d{2}$/u, `${file}: revision is a date`);
    assert.equal(new Date(`${meta.revision}T00:00:00Z`).toISOString().slice(0, 10), meta.revision, file);
    assert.ok(meta.revision <= today, `${file}: revision ${meta.revision} is in the future`);
    assert.equal(meta.implementation, version, `${file}: implementation names the release in package.json`);
    // The handwritten header the frontmatter replaced must not come back beside it.
    assert.doesNotMatch(source, /^\*\*Status:\*\*/mu, `${file} still carries a handwritten status line`);

    const page = main(`specifications/${spec.slug}/index.html`);
    const banner = text(/<p class="site-source">([\s\S]*?)<\/p>/u.exec(page)?.[1] ?? "");
    for (const part of [meta.id, `revision ${meta.revision}`, `implemented by ${version}`]) {
      assert.ok(banner.includes(part), `${spec.slug}: banner "${banner}" does not say ${part}`);
    }
    assert.ok(!banner.includes("Draft"), `${spec.slug}: the banner says Draft`);
    const card = text(index);
    assert.ok(card.includes(cardTitle(meta)), `the index has no card titled ${cardTitle(meta)}`);
    // The cards carry no status, ID or revision (2026-11-26, the user's decision), and no title names a version.
    assert.ok(!card.includes(meta.id), `the ${spec.slug} card names its ID`);
    assert.ok(!cardTitle(meta).match(/ v\d/), `the ${spec.slug} card's title names a version`);
  }
  assert.doesNotMatch(index, /\{\{/u, "a token survived into the index");
});

test("the worked example opens every record on the page, in the act it belongs to, and links each to its page in the Atlas", async () => {
  // The page used to be thirteen headings over fifteen links: it said what the
  // records were called and nothing about what they do, and reading one meant
  // leaving. Now each act explains what that part of the model is doing, and the
  // records are open on the page in Markset's folding callout, which is a
  // <details> and so needs no script.
  const index = main("example/index.html");
  const allFolds = [...index.matchAll(/<details class="([^"]*)"[^>]*>([\s\S]*?)<\/details>/g)];
  const folds = allFolds.filter((m) => m[1] === "ms-callout record-fold").map((m) => m[2]);
  assert.equal(folds.length, records.length, "one fold per record");
  assert.equal((index.match(/<h1[\s>]/g) ?? []).length, 1, "a record's own h1 is dropped inside its fold");

  for (const [n, act] of EXAMPLE_ACTS.entries()) {
    assert.ok(text(index).includes(`${n + 1}. ${act.title}`), `the page has act ${n + 1}`);
  }

  for (const record of records) {
    const fold = folds.find((f) => f.includes(`<code>${record.id}</code>`));
    assert.ok(fold, `${record.id} is not open on the page`);
    const summary = /<summary class="ms-callout-title">([\s\S]*?)<\/summary>/.exec(fold)?.[1] ?? "";
    assert.ok(text(summary).includes(record.title), `${record.id}: the fold is named by its title`);
    const read = text(fold);
    for (const value of [record.type, record.status, record.owner, record.visibility, ...record.audiences]) {
      assert.ok(read.includes(value), `${record.id}: the fold lacks ${value}`);
    }
    // Its own sections and the opening of its text are there, so the fold holds the
    // record and not only its fields. Whitespace is collapsed on both sides: a record
    // wraps its paragraphs in the file and the rendered page does not.
    const flat = (s: string) => s.replace(/\s+/g, " ").trim();
    for (const [, heading] of record.body.matchAll(/^## (.+)$/gm)) {
      assert.ok(flat(read).includes(heading.toUpperCase()) || flat(read).includes(heading), `${record.id}: ${heading}`);
    }
    const opening = flat(record.body.split(/\n## [^\n]+\n/)[1] ?? "").replace(/[`*]/g, "");
    assert.ok(opening.length > 20, `${record.id}: nothing to compare`);
    assert.ok(flat(read).includes(opening.slice(0, 60)), `${record.id}: the fold lacks its body`);
    // And the way to the record's page in the Atlas, which the deep links and the search results use (2026-11-26).
    assert.match(fold, new RegExp(`<a href="atlas/records/${record.id}\\.html">`), `${record.id}: no way to its page`);

    // The record's page is the Atlas's own, as `intentset serve` writes it: its heading, then its text as written.
    const page = await readFile(join(dist, atlasRecordPath(record.id)), "utf8");
    const title = record.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(page, new RegExp(`<h1[^>]*>${record.id}: ${title}</h1>`), `${record.id}: its heading`);
    assert.ok(flat(text(page)).includes(opening.slice(0, 60)), `${record.id}: the page lacks its body`);
    assert.doesNotMatch(page, /class="site-header"/, `${record.id}: the Atlas wears its own shell, not the site's`);
  }
  // The example says what state its Atlas shows: tests run at build time, one stale pass, one rule with no test.
  assert.ok(text(index).includes("one pass is stale because the code changed after its tests ran"));

  // The help article is approved, reviewed against its three sources, with two tips; every record but the sign-in
  // behavior is approved (2026-11-26), so Needs attention has one draft to show.
  const kb = records.find((r) => r.id === "KB-RESET-PASSWORD");
  assert.equal(kb?.status, "approved");
  assert.deepEqual(kb?.review?.pins, ["BEH-RESET-PASSWORD", "RULE-RESET-LINK-EXPIRY", "RULE-RESET-LINK-ONCE"]);
  assert.equal(kb?.tips.length, 2);
  assert.ok(text(index).includes(`Records approved ${records.length - 1}`));
  assert.deepEqual(
    records.filter((r) => r.status !== "approved").map((r) => r.id),
    ["BEH-SIGN-IN"],
  );

  // After the last act, what publication writes for it, as written: the document with provenance in place of its
  // frontmatter and its internal sources counted rather than named, and the help file with the two tips keyed by the
  // IDs a control carries. Nothing in either names an internal source.
  const published = allFolds.filter((m) => m[1].includes("publication-fold")).map((m) => m[2]);
  assert.equal(published.length, 1, "one publication fold");
  assert.ok(
    index.lastIndexOf("publication-fold") > index.lastIndexOf("<code>KB-RESET-PASSWORD</code>"),
    "the publication follows the knowledge",
  );
  const out = text(published[0]);
  for (const expected of [
    "intentset/publication/0.4",
    "withheldSources: 3",
    "reviewer: team-support",
    "intentset/help/0.4",
    // Each slice names the article that leads its page, so the help file maps both routes to it (ADR 0028).
    '"surfaces": {',
    '"/account/reset-password": {',
    '"/sign-in": {',
    ...(kb?.tips.map(([, tip]) => tip) ?? []),
  ]) {
    assert.ok(out.includes(expected), `the publication lacks ${expected}`);
  }
  for (const internal of [
    "Reset a forgotten password",
    "Reset links expire after one hour",
    "Reset links work once",
    "BEH-RESET-PASSWORD.md",
    "RULE-RESET-LINK-ONCE",
  ]) {
    assert.ok(!out.includes(internal), `the publication names ${internal}`);
  }
});

test("home is short: the promise, one example, how it works, what it is, and one way to try it (2026-11-26)", async () => {
  const home = main("index.html");
  assert.match(home, /For teams shipping with coding agents/);
  assert.match(home, /<span class="ms-span button primary"><a href="how-it-works\/">See how it works<\/a>/);
  assert.match(home, /<span class="ms-span button"><a href="start\/">Get started<\/a>/);
  assert.match(home, /<h2 id="problem">/);
  assert.match(home, /<section class="ms-card example"/);
  // What the user asked to go: the six-record card, the loop, versions and drafts, the status card, the adoption log.
  assert.doesNotMatch(home, /class="[^"]*\b(?:model|loop|status)\b/);
  assert.doesNotMatch(home, /href="pilot\/"|href="roadmap\/"|href="tools\/readers\/"|href="introducing\/"/);
  // It stays short: the user found it massive at 2,816 words.
  const words = (await readFile(join(root, "site", "content", "index.md"), "utf8")).split(/\s+/).length;
  assert.ok(words < 800, `Home's source is ${words} words`);
});

test("the build leaves no placeholder behind", async () => {
  for (const [page, doc] of html) {
    assert.doesNotMatch(doc, /\{\{\w+\}\}/, page);
    assert.doesNotMatch(doc, /lorem|TODO/i, page);
  }
  const written = await readdir(dist);
  assert.ok(!written.some((name) => name.includes("staging")), "a staging directory was left in dist");
});

test("a term becomes a tooltip reached by pointer, keyboard or tap, described by its tip, with ids unique to the page", () => {
  const html = termTips(
    '<p>A <span class="ms-span term" data-tip="Known &#x22;old&#x22; ones">baselined</span> list and a <span class="ms-span term" data-tip="One feature.">slice</span>.</p>',
  );
  assert.equal(
    html,
    '<p>A <span class="term" tabindex="0" aria-describedby="term-tip-1">baselined<span class="term-tip" id="term-tip-1" role="tooltip">Known &#x22;old&#x22; ones</span></span> list and a <span class="term" tabindex="0" aria-describedby="term-tip-2">slice<span class="term-tip" id="term-tip-2" role="tooltip">One feature.</span></span>.</p>',
  );
  assert.equal(
    termTips('<span class="ms-span badge">Draft</span>'),
    '<span class="ms-span badge">Draft</span>',
    "other spans are left alone",
  );
});

test("a page that left the site sends its reader on from its old address, and is not in the sitemap", async () => {
  const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
  for (const [path, to] of REDIRECTS) {
    const doc = await readFile(join(dist, path), "utf8");
    assert.ok(doc.includes(`<meta http-equiv="refresh" content="0; url=${to}">`), path);
    assert.ok(doc.includes(`<a href="${to}">`), `${path}: a link for what does not follow a refresh`);
    assert.match(doc, /<meta name="robots" content="noindex">/, path);
    assert.ok(
      to.startsWith(`${REPO}/blob/main/`) || to === EXTERNAL.markset || to.startsWith(`${CANONICAL}${ATLAS_ROOT}/`),
      `${path} goes to the repository, Markset or the shop's Atlas`,
    );
    if (to.startsWith(CANONICAL)) await access(join(dist, to.slice(CANONICAL.length)));
    assert.ok(!sitemap.includes(path.replace(/index\.html$/, "")), `${path} is in the sitemap`);
    assert.ok(!html.has(path), `${path} is still a page`);
  }
  for (const doc of ["docs/adoption/log.md", "docs/roadmap.md", "docs/consumers.md"]) await access(join(root, doc));
});

test("the shop's Atlas is published as intentset serve writes it, and the serve page opens it in a new tab (2026-11-26)", async () => {
  const atlas = (name: string) => readFile(join(dist, ATLAS_ROOT, name), "utf8");
  const product = await atlas("index.html");
  // The Atlas's own shell and navigation, not the site's, saying on every page that the shop is invented.
  assert.doesNotMatch(product, /class="site-header"/);
  assert.match(product, /<meta name="robots" content="noindex, nofollow">/);
  const nav = [...product.matchAll(/<a href="[^"]*"(?: aria-current="page")?>([^<]+)<\/a>/g)].map((m) => m[1]);
  for (const label of ["Product", "Needs attention", "Map", "Records"]) assert.ok(nav.includes(label), label);
  assert.ok(text(product).includes("An invented example:"));
  assert.ok(text(product).includes("Your product, as a tree"));
  // The state it shows is real: the tests ran, so the reset link's rule is verified, the sign-in code changed after
  // its run so its pass is stale, the rule that a link works once has no test, and the sign-in behavior is a draft.
  const attention = text(await atlas("attention.html"));
  assert.match(attention, /Stale: 2 of 6 claims/);
  assert.match(attention, /BEH-SIGN-IN Sign in · behavior/);
  assert.match(attention, /Named by no verification: 1 of 6 claims .* RULE-RESET-LINK-ONCE/);
  // None of it is in the sitemap.
  const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
  assert.ok(!sitemap.includes(`${ATLAS_ROOT}/`), "the Atlas is not in the sitemap");
  // The run records carry the example's fixed times, so the build is the same every time.
  assert.ok(EXAMPLE_TIMES.testsStarted < EXAMPLE_TIMES.laterCommit);
  // The serve page explains the command and opens the Atlas in a new tab.
  const serve = main("tools/serve/index.html");
  assert.match(serve, /<a href="\.\.\/\.\.\/example\/atlas\/" target="_blank" rel="noopener">Open the shop/);
  assert.match(text(serve), /starts a small web server on your machine/);
  assert.match(text(serve), /http:\/\/127\.0\.0\.1:3000\//);
});

test("every page points at the social card, and the committed card is the size it claims", async () => {
  // Without a card a link to the site previews as text. The file is drawn by hand
  // (`pnpm run social-card`) and committed, so no deploy needs a browser; this
  // holds the picture to the size the pages tell a reader to expect, which is what
  // a client lays the preview out from before it has the bytes.
  for (const [page, doc] of html) {
    if (page === NOT_FOUND) {
      assert.doesNotMatch(doc, /og:image/, "the 404 page asks not to be indexed and claims no card");
      continue;
    }
    assert.ok(doc.includes(`<meta property="og:image" content="${cardUrl()}">`), `${page}: names the card`);
    assert.ok(doc.includes(`<meta property="og:image:width" content="${CARD.width}">`), `${page}: its width`);
    assert.ok(doc.includes(`<meta property="og:image:height" content="${CARD.height}">`), `${page}: its height`);
    assert.ok(doc.includes(`<meta property="og:image:alt" content="${CARD_ALT}">`), `${page}: what it says`);
    assert.ok(doc.includes('<meta name="twitter:card" content="summary_large_image">'), `${page}: shown large`);
  }
  // A PNG declares its size in the IHDR chunk, the first after the signature.
  const png = await readFile(join(dist, CARD.file));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", "the card is a PNG");
  const ratio = png.readUInt32BE(16) / CARD.width;
  assert.equal(png.readUInt32BE(16), CARD.width * ratio, `the card is ${CARD.width} wide, or a whole multiple of it`);
  assert.equal(png.readUInt32BE(20), CARD.height * ratio, `and ${CARD.height} tall at the same scale`);
  assert.ok(Number.isInteger(ratio) && ratio >= 1, `drawn at ${ratio}x`);
});
