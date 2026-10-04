/**
 * Static site generator for intentset.org. Every page is a Markset document
 * rendered by the Markset reference implementation and wrapped in a shell that
 * carries the header, the navigation, an optional contents rail and the footer.
 *
 * Three kinds of page: the content pages, written in site/content/*.md with the
 * copy from the information architecture document; the normative documents,
 * rendered from spec/ so the site cannot drift from the specification; and the
 * worked example, rendered from examples/scheduling/ one record per page.
 *
 * Output: dist/ with relative links, so it works at any base path as well as on
 * the custom domain. Nothing rendered from a document carries a script; the one
 * script on a page is the shell's, and it only remembers the reader's color
 * scheme (SCHEME_SCRIPT).
 *
 *   npm run site
 */
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import type { Heading, Link, Nodes, Root } from "mdast";
import { type Diagnostic, parseDocument } from "@markset-lang/parser";
import { addHeadingIds, bodyAttributes, defaultStylesheetPath, renderHtml } from "@markset-lang/render-html";
import { type ExampleRecord, loadRecords, typeRank } from "./records.ts";

const root = resolve(import.meta.dirname, "..");

/** Repository and site URLs come from package.json so they cannot drift from the remote. */
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  repository: { url: string };
  homepage: string;
};
export const REPO = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
export const CANONICAL = new URL(pkg.homepage).href;
/** The host the site is served from, for the CNAME file Pages reads. */
export const SITE_HOST = new URL(pkg.homepage).host;

/** The two confirmed destinations outside this site. */
export const EXTERNAL = {
  markset: "https://markset.org/",
  coralReef: "https://coralreefventures.com/",
};

export const SITE_NAME = "Intentset";

/**
 * The bar, as the information architecture names it. How it works was an anchor
 * on the home page and is a page of its own since 2026-10-03, so the home page
 * can stay with the outcome and the explanation can take the room it needs.
 */
export const NAV: Array<[string, string]> = [
  ["How it works", "how-it-works/index.html"],
  ["Specifications", "specifications/index.html"],
  ["Markset", "markset/index.html"],
  ["Roadmap", "roadmap/index.html"],
];

export const FOOTER_LINKS: Array<[string, string]> = [
  ["How it works", "how-it-works/index.html"],
  ["Start", "start/index.html"],
  ["Specifications", "specifications/index.html"],
  ["Roadmap", "roadmap/index.html"],
  ["Markset", "markset/index.html"],
  ["About", "about/index.html"],
];

export const FOOTER = {
  statement: "An open-source project in development from Coral Reef Ventures.",
  independence: "Markset, Intentset, Streamlane, and Driftline can be adopted independently.",
  repository: "Contribute on GitHub",
};

/** The normative documents, each rendered from its single source under /specifications/. */
export const SPECS: Array<{ slug: string; file: string }> = [
  { slug: "core", file: "core-0.1.md" },
  { slug: "vsa", file: "vsa-0.1.md" },
  { slug: "profile-typescript-amplify-gen2", file: "profile-typescript-amplify-gen2-0.1.md" },
  { slug: "publication", file: "publication.md" },
  { slug: "export", file: "export.md" },
];

const ROADMAP_DOC = "docs/requirements/roadmap/05-implementation-roadmap.md";
const EXAMPLE_DIR = "examples/scheduling";

/** The content pages: output path and source file under site/content/. */
export const CONTENT_PAGES: Array<[string, string]> = [
  ["index.html", "index.md"],
  ["how-it-works/index.html", "how-it-works.md"],
  ["start/index.html", "start.md"],
  ["specifications/index.html", "specifications.md"],
  ["markset/index.html", "markset.md"],
  ["roadmap/index.html", "roadmap.md"],
  ["about/index.html", "about.md"],
];

interface Page {
  /** Output path relative to dist/, e.g. "start/index.html". */
  path: string;
  title: string;
  description: string;
  /** Rendered <main> content. */
  body: string;
  /** Contents rail, as HTML, for the long documents. */
  toc?: string;
  bodyAttributes: string;
}

/**
 * Build into outDir. The tree is written to a staging directory unique to this
 * build and renamed into place, so a reader (or the watch server) never sees a
 * half-written site and a failed build leaves the previous one intact.
 */
export async function build(outDir: string = join(root, "dist")): Promise<string[]> {
  const tag = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const staging = `${outDir}.staging-${tag}`;
  const previous = `${outDir}.previous-${tag}`;
  try {
    const written = await writeSite(staging);
    const hadPrevious = await rename(outDir, previous).then(
      () => true,
      () => false, // absent on a first build
    );
    try {
      await rename(staging, outDir);
    } catch (error) {
      if (hadPrevious) await rename(previous, outDir);
      throw error;
    }
    return written;
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(previous, { recursive: true, force: true });
  }
}

async function writeSite(out: string): Promise<string[]> {
  await mkdir(join(out, "css"), { recursive: true });
  // Pages reads the custom domain from a CNAME file at the root of what it
  // serves. The host comes from package.json's homepage, so there is one place
  // to change it.
  await writeFile(join(out, "CNAME"), `${SITE_HOST}\n`);
  await cp(defaultStylesheetPath, join(out, "css", "markset.css"));
  await cp(join(root, "site", "site.css"), join(out, "css", "site.css"));
  await cp(join(root, "site", "icon.svg"), join(out, "icon.svg"));

  const specs = await Promise.all(SPECS.map(specPage));
  const records = await loadRecords(join(root, EXAMPLE_DIR));
  const tokens = {
    repo: REPO,
    markset: EXTERNAL.markset,
    coral: EXTERNAL.coralReef,
    // The Markset page's CTA points into the Core specification's section on
    // Markset profiles. The anchor is read from the rendered document rather
    // than written by hand, so renumbering the section cannot break the link.
    coreMarksetSection: sectionAnchor(specs[0], /markset/i),
    // The roadmap's link to the profile's areas, read the same way.
    profileAreasSection: sectionAnchor(specs[2], /areas/i),
  };
  const pages: Page[] = [
    ...(await Promise.all(CONTENT_PAGES.map(([path, file]) => contentPage(path, file, tokens)))),
    ...specs,
    await roadmapDocPage(),
    exampleIndex(records),
    ...records.map((record) => recordPage(record, records)),
  ];

  const written: string[] = [];
  for (const page of pages) {
    const file = join(out, page.path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, shell(page));
    written.push(page.path);
  }
  return written;
}

// ---------------------------------------------------------------------------

/** Content pages long enough to want the contents rail the specifications have. */
const RAIL_PAGES = new Set(["how-it-works/index.html"]);

/** A content page: site/content/<file>, tokens substituted, rendered and wrapped. */
async function contentPage(path: string, file: string, tokens: Record<string, string>): Promise<Page> {
  const source = join(root, "site", "content", file);
  let text = await readFile(source, "utf8");
  for (const [name, value] of Object.entries(tokens)) text = text.replaceAll(`{{${name}}}`, value);
  const leftover = /\{\{\w+\}\}/.exec(text);
  if (leftover) throw new Error(`${relative(root, source)}: unsubstituted token ${leftover[0]}`);
  return renderPage(path, text, source, {}, RAIL_PAGES.has(path));
}

function renderPage(path: string, source: string, file: string, extra: Partial<Page> = {}, rail = false): Page {
  const parsed = parseDocument(source);
  failOnErrors(parsed.diagnostics, file);
  const ast = addHeadingIds(parsed.ast);
  return {
    path,
    title: firstHeading(ast) ?? basename(file, ".md"),
    description: firstParagraph(ast),
    body: renderHtml(ast, { diagrams: false, charts: false }),
    bodyAttributes: bodyAttributes(ast.frontmatter ?? null),
    ...(rail ? { toc: tableOfContents(ast, 2, 3) } : {}),
    ...extra,
  };
}

/**
 * A normative document, rendered from spec/ with a contents rail. Links between
 * the documents become links between their pages; a link to anything else in
 * the repository goes to the repository.
 */
async function specPage(spec: { slug: string; file: string }): Promise<Page> {
  return documentPage(`specifications/${spec.slug}/index.html`, join("spec", spec.file));
}

/**
 * The roadmap Intentset was planned from. It is part of the frozen handoff in
 * docs/requirements/ and is never edited, so the page says above it what has
 * changed since: without that, a reader meets "not currently installable" and a
 * working name on a site whose toolchain is on npm.
 */
export const ROADMAP_DOC_NOTE = `> [!NOTE] Kept as it was handed over
> This is the roadmap Intentset was planned from, unchanged. The toolchain it describes shipped in 0.1, and the questions it leaves open are settled: the name is Intentset, the licence is MIT, and the commands it proposes are installable from \`@intentset/cli\`. What came after is on the [roadmap](../index.html).`;

async function roadmapDocPage(): Promise<Page> {
  return documentPage("roadmap/implementation/index.html", ROADMAP_DOC, ROADMAP_DOC_NOTE);
}

async function documentPage(path: string, file: string, note?: string): Promise<Page> {
  const absolute = join(root, file);
  const parsed = parseDocument(await readFile(absolute, "utf8"));
  failOnErrors(parsed.diagnostics, absolute);
  rewriteLinks(parsed.ast, file);
  const ast = addHeadingIds(parsed.ast);
  let banner = `<p class="site-source">Rendered from <a href="${REPO}/blob/main/${file}"><code>${esc(file)}</code></a> in the repository.</p>\n`;
  if (note !== undefined) {
    const parsedNote = parseDocument(note);
    failOnErrors(parsedNote.diagnostics, absolute);
    banner += `${renderHtml(parsedNote.ast, { diagrams: false, charts: false })}\n`;
  }
  return {
    path,
    title: firstHeading(ast) ?? basename(file, ".md"),
    description: firstParagraph(ast),
    body: banner + renderHtml(ast, { diagrams: false, charts: false }),
    toc: tableOfContents(ast, 2, 3),
    bodyAttributes: bodyAttributes(ast.frontmatter ?? null),
  };
}

/** Point a document's relative links at the site where it has a page, and at the repository otherwise. */
function rewriteLinks(tree: Root, file: string): void {
  const dir = posix.dirname(file.split("\\").join("/"));
  visit(tree, (node) => {
    if (node.type !== "link") return;
    const link = node as Link;
    if (/^[a-z][a-z0-9+.-]*:/i.test(link.url) || link.url.startsWith("#") || link.url.startsWith("//")) return;
    const [target, fragment = ""] = link.url.split("#");
    const inRepo = posix.normalize(posix.join(dir, target));
    const spec = SPECS.find((s) => posix.join("spec", s.file) === inRepo);
    if (spec) {
      link.url = `../${spec.slug}/index.html${fragment ? `#${fragment}` : ""}`;
    } else if (inRepo === ROADMAP_DOC) {
      link.url = `../implementation/index.html${fragment ? `#${fragment}` : ""}`;
    } else {
      link.url = `${REPO}/blob/main/${inRepo}${fragment ? `#${fragment}` : ""}`;
    }
  });
}

/** The id of the first level-two heading in a rendered page whose text matches. */
function sectionAnchor(page: Page, pattern: RegExp): string {
  for (const [, id, text] of page.body.matchAll(/<h2 id="([^"]+)">([^<]*)</g)) {
    if (pattern.test(text)) return id;
  }
  throw new Error(`${page.path}: no section matches ${pattern}`);
}

// ---------------------------------------------------------------------------

/**
 * The example index: every record, grouped by type in the model's order, with
 * its id, title and status. Generated as Markset source and rendered, so the
 * page is a Markset document like every other one.
 */
function exampleIndex(records: ExampleRecord[]): Page {
  const groups = new Map<string, ExampleRecord[]>();
  for (const record of records) groups.set(record.type, [...(groups.get(record.type) ?? []), record]);
  const sections = [...groups.entries()]
    .sort(([a], [b]) => typeRank(a) - typeRank(b) || a.localeCompare(b))
    .map(
      ([type, list]) =>
        `## ${capitalize(type)}\n\n${list
          .map((r) => `- [${r.id}](${r.id}/index.html) — ${md(r.title)} [${md(r.status)}]{.badge}`)
          .join("\n")}`,
    )
    .join("\n\n");
  const source = `---
markset: 0
---

{.eyebrow}
Worked example · all records are draft

# Schedule an assessment

{.lead}
Follow one behavior through intent, rules, ownership, verification, and customer guidance.

No running product, passing evidence, or publication is claimed. Planned code paths do not exist in this package.

${sections}
`;
  return renderPage("example/index.html", source, join(root, EXAMPLE_DIR, "index.md"));
}

/** One record: its metadata as a card, then the document body, then a way back. */
function recordPage(record: ExampleRecord, records: ExampleRecord[]): Page {
  const ids = new Set(records.map((r) => r.id));
  const ref = (id: string) => (ids.has(id) ? `[${id}](../${id}/index.html)` : `\`${id}\``);
  const rows: Array<[string, string]> = [
    ["ID", `\`${record.id}\``],
    ["Type", md(record.type)],
    ["Status", `[${md(record.status)}]{.badge}`],
    ["Owner", md(record.owner)],
    ["Visibility", md(record.visibility)],
    ["Audiences", record.audiences.map(md).join(", ")],
  ];
  if (record.parent) rows.push(["Parent", ref(record.parent)]);
  for (const [name, targets] of record.links) rows.push([relationLabel(name), targets.map(ref).join(", ")]);
  const table = ["| Field | Value |", "|---|---|", ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
  const source = `---
markset: 0
---

{.eyebrow}
Worked example · ${md(record.type)}

:::card{.record}
${table}
:::

${record.body.trim()}

{.site-back}
[All records in the worked example](../index.html)
`;
  return renderPage(`example/${record.id}/index.html`, source, join(root, EXAMPLE_DIR, record.file));
}

/** `governedBy` reads as "Governed by". */
function relationLabel(name: string): string {
  return capitalize(name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Escape text going into generated Markset source so it reads as text. */
function md(text: string): string {
  return text.replace(/[\\`*_[\]{}|<>]/g, "\\$&");
}

// ---------------------------------------------------------------------------

function shell(page: Page): string {
  const depth = page.path.split("/").length - 1;
  const rel = depth === 0 ? "./" : "../".repeat(depth);
  const nav = NAV.map(([label, href]) => {
    const section = href.replace(/index\.html(#.*)?$/, "");
    const active = page.path === href || (section !== "" && page.path.startsWith(section));
    return `<a href="${rel}${href}"${active ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  }).join("\n");
  const footerLinks = FOOTER_LINKS.map(
    ([label, href]) => `<a href="${rel}${href}"${page.path === href ? ' aria-current="page"' : ""}>${esc(label)}</a>`,
  ).join("\n");
  const rail = page.toc
    ? `<aside class="site-toc"><nav aria-label="Contents"><p class="site-rail-title">On this page</p>\n${page.toc}</nav></aside>\n`
    : "";
  // The pattern all four sites share (Streamlane's): the home page is "Intentset
  // · what it is", every other page "Page · Intentset", and a heading's closing
  // period is dropped, since a title is a label rather than a sentence.
  const label = page.title.replace(/\.$/, "");
  const title = page.path === "index.html" ? `${SITE_NAME} · ${label}` : `${label} · ${SITE_NAME}`;
  const canonical = new URL(page.path.replace(/index\.html$/, ""), CANONICAL).href;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/svg+xml" href="${rel}icon.svg">
<link rel="stylesheet" href="${rel}css/markset.css">
<link rel="stylesheet" href="${rel}css/site.css">
</head>
<body${page.bodyAttributes}>
${SCHEME_SCRIPT}<a class="site-skip" href="#main">Skip to content</a>
<header class="site-header">
<a class="site-brand" href="${rel}index.html"><img class="site-mark" src="${rel}icon.svg" alt="" width="28" height="28">${SITE_NAME}</a>
<nav class="site-nav" aria-label="Main">
${nav}
</nav>
${SCHEME_CONTROL}</header>
<div class="site-layout${rail ? " has-rail" : ""}">
${rail}<main id="main" class="ms-document" tabindex="-1">
${page.body}</main>
</div>
<footer class="site-footer">
<div>
<nav class="site-footer-nav" aria-label="Footer">
${footerLinks}
</nav>
<p><strong>${SITE_NAME}</strong> · ${esc(FOOTER.statement)} <a href="${REPO}">${esc(FOOTER.repository)}</a></p>
<p>${esc(FOOTER.independence)}</p>
</div>
${FAMILY_MARK}</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------

/**
 * The network figure from coralreefventures.com, which draws the three
 * products as clusters of nodes: Markset's two, Intentset's two, Streamlane's
 * one, and two unaffiliated. Here Intentset's nodes carry the accent and the
 * rest stay quiet: the family's mark, worn by one member. Inline so its colors
 * are tokens and follow the reader's scheme; decoration, so hidden from
 * assistive technology.
 */
const FAMILY_MARK = `<svg class="site-family" viewBox="0 0 384 240" aria-hidden="true" focusable="false"><path d="M40 170 112 96 196 132 268 52 344 104M112 96 150 30 268 52M196 132 236 206 344 104M40 170 236 206M150 30 196 132"/><circle cx="40" cy="170" r="7"/><circle cx="112" cy="96" r="9"/><circle cx="150" cy="30" r="5"/><circle class="own" cx="196" cy="132" r="10"/><circle cx="236" cy="206" r="5"/><circle class="own" cx="268" cy="52" r="8"/><circle cx="344" cy="104" r="8"/></svg>
`;

/**
 * The reader's color scheme, the same control markset.org has: three radio
 * inputs, read by body:has() in site.css, with markset.css resolving every
 * color from color-scheme. Auto is checked, so a reader who never touches it
 * keeps their system preference. Each option is an icon with its word kept in
 * the accessibility tree.
 */
const ICON_AUTO = `<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/></svg>`;
const ICON_LIGHT = `<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>`;
const ICON_DARK = `<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z"/></svg>`;

export const SCHEME_CONTROL = `<div class="site-scheme-slot"><div class="site-scheme" role="group" aria-label="Color scheme">
<input type="radio" name="ms-scheme" id="ms-scheme-auto" class="site-scheme-input" checked>
<label class="site-scheme-option" for="ms-scheme-auto" title="Match the system">${ICON_AUTO}<span class="site-visually-hidden">Auto</span></label>
<input type="radio" name="ms-scheme" id="ms-scheme-light" class="site-scheme-input">
<label class="site-scheme-option" for="ms-scheme-light" title="Light">${ICON_LIGHT}<span class="site-visually-hidden">Light</span></label>
<input type="radio" name="ms-scheme" id="ms-scheme-dark" class="site-scheme-input">
<label class="site-scheme-option" for="ms-scheme-dark" title="Dark">${ICON_DARK}<span class="site-visually-hidden">Dark</span></label>
</div></div>
`;

/**
 * The only script on a built page, and all it does is carry the reader's scheme
 * choice from one page to the next, which no CSS can do. It is chrome, ahead of
 * <main>, and nothing rendered from a document carries a script. With scripting
 * off the control still works for the page it is on. It writes data-scheme on
 * <body>, the hook markset.css publishes (Markset spec §6), and runs first so
 * the scheme is in force before anything paints.
 */
export const SCHEME_SCRIPT = `<script>
(function () {
  var key = "ms-scheme";
  var read = function () {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  };
  var apply = function (value) {
    if (value === "light" || value === "dark") document.body.dataset.scheme = value;
    else delete document.body.dataset.scheme;
  };
  apply(read());
  document.addEventListener("change", function (event) {
    var input = event.target;
    if (!input || input.name !== key) return;
    var value = input.id.slice(key.length + 1);
    apply(value);
    try {
      if (value === "auto") localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  });
  document.addEventListener("DOMContentLoaded", function () {
    var value = read();
    var input = document.getElementById(key + "-" + (value === "light" || value === "dark" ? value : "auto"));
    if (input) input.checked = true;
  });
})();
</script>
`;

// ---------------------------------------------------------------------------

/** Constructs whose headings are their own (a tab's label, a card's section) rather than the page's. */
const OPAQUE_TO_CONTENTS = new Set(["tabs", "tab", "steps", "grid", "card", "figure", "callout", "metrics"]);

function sectionHeadings(node: Nodes, min: number, max: number, into: Heading[] = []): Heading[] {
  if (node.type === "heading" && node.depth >= min && node.depth <= max) into.push(node as Heading);
  if ("children" in node) {
    for (const child of node.children as Nodes[]) {
      if (!OPAQUE_TO_CONTENTS.has(child.type)) sectionHeadings(child, min, max, into);
    }
  }
  return into;
}

function tableOfContents(ast: Root, min: number, max: number): string {
  const items = sectionHeadings(ast, min, max);
  return `<ul>\n${items
    .map((h) => `<li class="toc-${h.depth}"><a href="#${h.attributes?.id ?? ""}">${esc(text(h))}</a></li>`)
    .join("\n")}\n</ul>`;
}

function visit(node: Nodes, fn: (node: Nodes) => void): void {
  fn(node);
  if ("children" in node) for (const child of node.children as Nodes[]) visit(child, fn);
}

function text(node: { type?: string; value?: unknown; children?: unknown[] }): string {
  if (node.type === "break") return " ";
  if (typeof node.value === "string" && node.type !== "html") return node.value;
  return (node.children ?? []).map((c) => text(c as { value?: unknown })).join("");
}

/** The page's title: its first level-1 heading, including one inside a layout construct such as the hero's columns. */
function firstHeading(ast: Root): string | null {
  const h = sectionHeadings(ast, 1, 1)[0];
  return h ? text(h) : null;
}

/** The first paragraph after the first heading, for the page's description. */
function firstParagraph(ast: Root): string {
  let found: string | null = null;
  let pastHeading = false;
  visit(ast, (node) => {
    if (found !== null) return;
    if (node.type === "heading" && node.depth === 1) pastHeading = true;
    if (pastHeading && node.type === "paragraph") found = text(node).replace(/\s+/g, " ").trim();
  });
  return found ?? "";
}

function failOnErrors(diagnostics: Diagnostic[], file: string): void {
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw new Error(`${relative(root, file)}: ${errors.map((d) => d.code).join(", ")}`);
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const target = join(root, "dist");
  const written = await build(target);
  console.log(`site: ${written.length} pages written to ${relative(process.cwd(), target)}/`);
}
