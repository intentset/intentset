/**
 * Static site generator for intentset.org. Every page is a Markset document
 * rendered by the Markset reference implementation and wrapped in a shell that
 * carries the header, the navigation, an optional contents rail and the footer.
 *
 * Five kinds of page: the content pages, written in site/content/*.md; the
 * normative documents, rendered from spec/ so the site cannot drift from the
 * specification; the worked example, rendered from examples/scheduling/ one
 * record per page; the agent guide, rendered from the generator `intentset
 * init` writes it with; and the conformance page, generated from tests/.
 *
 * Beside the pages: /guide.md and /llms.txt for agents, every schema under
 * /spec/ at the URL its $id names, sitemap.xml, robots.txt and a 404 page.
 *
 * Output: dist/ with relative links, so it works at any base path as well as on
 * the custom domain. Nothing rendered from a document carries a script; the one
 * script on a page is the shell's, and it only remembers the reader's color
 * scheme (SCHEME_SCRIPT).
 *
 *   pnpm run site
 */
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import type { Heading, Link, Nodes, Root } from "mdast";
import { agentGuide, USAGE } from "@intentset/cli";
import { type Diagnostic, parseDocument } from "@markset-lang/parser";
import { addHeadingIds, bodyAttributes, defaultStylesheetPath, renderHtml } from "@markset-lang/render-html";
import { type ExampleRecord, loadRecords, readYaml, splitFrontmatter } from "./records.ts";

const root = resolve(import.meta.dirname, "..");

/** Repository and site URLs come from package.json so they cannot drift from the remote. */
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  repository: { url: string };
  homepage: string;
  version: string;
};
export const REPO = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
export const CANONICAL = new URL(pkg.homepage).href;
/** The host the site is served from, for the CNAME file Pages reads. */
export const SITE_HOST = new URL(pkg.homepage).host;
/** The release the pages name, read from package.json as {{version}} so no page can name a stale one. */
export const VERSION = pkg.version;
/** Pages serves 404.html for any address it has nothing at; see shell() for why its links start at the root. */
export const NOT_FOUND = "404.html";
/** Where a page lives once published: the address canonical, og:url and the sitemap give for it. */
export function canonicalUrl(path: string): string {
  return new URL(path.replace(/(^|\/)index\.html$/, "$1"), CANONICAL).href;
}

/**
 * The social card: what a link to the site previews as in a chat client, a feed
 * or a search result. `site/social-card.ts` draws it at this size from these
 * words; the build copies the committed file, so no deploy needs a browser.
 */
export const CARD = { width: 1200, height: 630, file: "social-card.png" };

/** The card's absolute address: whatever reads og:image has no page to resolve a relative one against. */
export function cardUrl(): string {
  return new URL(CARD.file, CANONICAL).href;
}

/** The two confirmed destinations outside this site. */
export const EXTERNAL = {
  markset: "https://markset.org/",
  coralReef: "https://coralreefventures.com/",
};

/**
 * The sibling site, linked from the footer (decided 2026-10-05), as markset.org
 * links this one. Intentset's records are Markset documents.
 */
export const SIBLING = { name: "Markset", url: EXTERNAL.markset };

export const SITE_NAME = "Intentset";

/**
 * The bar: five sections, by what a reader came to do, as markset.org's is
 * (decided 2026-10-05). Five is the phone's limit, and home is the wordmark.
 * Until then the bar was by topic, from the handoff's IA: How it works, Start,
 * Specifications, Markset and Roadmap, which gave a slot to the sibling's page
 * while the tools had no page at all. How it works moved into Start's rail, the
 * Markset page into Reference's, and Roadmap took the slot markset.org gives its
 * Playground, because an early release's reader asks first where it stands.
 * Every page kept its URL: Reference is the specifications index, Examples the
 * worked example's.
 */
export const NAV: Array<[string, string]> = [
  ["Start", "start/index.html"],
  ["Tools", "tools/index.html"],
  ["Reference", "specifications/index.html"],
  ["Examples", "example/index.html"],
  ["Roadmap", "roadmap/index.html"],
];

/**
 * The rails: the pages that belong to each bar item, listed beside every page
 * in that section. The bar cannot hold everything, and a page reached only from
 * a sentence is one most readers never find, so the rest are here. A test
 * requires every page to be in the bar, a rail or the footer's row.
 */
export const RAILS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Start",
    items: [
      ["Start with one capability", "start/index.html"],
      ["How it works", "how-it-works/index.html"],
      ["Run the adoption", "adopt/index.html"],
      ["The agent guide", "guide/index.html"],
    ],
  },
  {
    title: "Tools",
    items: [
      ["All tools", "tools/index.html"],
      ["The intentset command", "tools/cli/index.html"],
    ],
  },
  {
    title: "Reference",
    items: [
      ["Specifications", "specifications/index.html"],
      ["Core", "specifications/core/index.html"],
      ["Traceable VSA", "specifications/vsa/index.html"],
      ["TypeScript + Amplify Gen 2", "specifications/profile-typescript-amplify-gen2/index.html"],
      ["Publication profile", "specifications/publication/index.html"],
      ["Export contract", "specifications/export/index.html"],
      ["Markset", "markset/index.html"],
      ["Conformance", "conformance/index.html"],
    ],
  },
  {
    title: "Examples",
    items: [
      ["The worked example", "example/index.html"],
      ["The adoption log", "pilot/index.html"],
    ],
  },
];

/** The rail a page sits in: the one listing it, or, for a record of the worked example, Examples. */
export function railFor(path: string): (typeof RAILS)[number] | undefined {
  return (
    RAILS.find((rail) => rail.items.some(([, href]) => href === path)) ??
    (path.startsWith("example/") ? RAILS.find((rail) => rail.title === "Examples") : undefined)
  );
}

/** The footer's row: the bar again, and About, which is in no rail. */
export const FOOTER_LINKS: Array<[string, string]> = [...NAV, ["About", "about/index.html"]];

/**
 * The footer's one line, the family's (decided 2026-10-06, the same on
 * markset.org): the name, what it is in one sentence (the approved tagline),
 * the source, the company and the sibling site.
 */
export const FOOTER = {
  statement: "Keep control of what your agents build.",
  repository: "Source on GitHub",
  company: "A Coral Reef Ventures project",
};

/** What the card says, for a reader who gets its alternative text instead of the picture. */
export const CARD_ALT = `${SITE_NAME}: ${FOOTER.statement}`;

/** The normative documents, each rendered from its single source under /specifications/. */
export const SPECS: Array<{ slug: string; file: string }> = [
  { slug: "core", file: "core-0.1.md" },
  { slug: "vsa", file: "vsa-0.1.md" },
  { slug: "profile-typescript-amplify-gen2", file: "profile-typescript-amplify-gen2-0.1.md" },
  { slug: "publication", file: "publication.md" },
  { slug: "export", file: "export.md" },
];

/**
 * What a specification says about itself, in its frontmatter (Core §1's change
 * policy): its title, its ID, its status, the date its text last changed and
 * the reference release that implements that revision. The page's banner and
 * the specifications index's cards are rendered from it, so neither can drift
 * from the document.
 */
export interface SpecMeta {
  title: string;
  id: string;
  status: string;
  revision: string;
  implementation: string;
}

export const SPEC_META_KEYS = ["title", "id", "status", "revision", "implementation"] as const;

/** Read a specification's frontmatter. Throws when a key is missing or is not text, so a build cannot ship a blank banner. */
export function readSpecMeta(source: string, file: string): SpecMeta {
  const { yaml } = splitFrontmatter(source);
  const meta = readYaml(yaml);
  for (const key of SPEC_META_KEYS) {
    if (typeof meta[key] !== "string" || meta[key] === "") throw new Error(`${file}: frontmatter has no ${key}`);
  }
  return meta as unknown as SpecMeta;
}

/** A specification's status for a reader: `draft` reads as Draft. */
export function statusLabel(status: string): string {
  return capitalize(status);
}

const EXAMPLE_DIR = "examples/scheduling";

/** The content pages: output path and source file under site/content/. */
export const CONTENT_PAGES: Array<[string, string]> = [
  ["index.html", "index.md"],
  ["how-it-works/index.html", "how-it-works.md"],
  ["start/index.html", "start.md"],
  ["adopt/index.html", "adopt.md"],
  ["pilot/index.html", "pilot.md"],
  ["tools/index.html", "tools.md"],
  ["tools/cli/index.html", "cli.md"],
  ["specifications/index.html", "specifications.md"],
  ["markset/index.html", "markset.md"],
  ["roadmap/index.html", "roadmap.md"],
  ["about/index.html", "about.md"],
  [NOT_FOUND, "404.md"],
];

/**
 * The agent guide as the site serves it: what `intentset init` writes to
 * .intentset/agents.md, from the same generator, with a placeholder where a
 * repository's scope goes. A static copy cannot know a repository's scope,
 * which is why init generates the real one.
 */
export const GUIDE_SCOPE = "<the scope in .intentset/config.yaml>";
export function siteGuide(): string {
  return agentGuide([GUIDE_SCOPE]);
}

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
  // The social card, drawn by hand with `pnpm run social-card` and committed, so
  // neither CI nor a deploy needs a browser to produce it. See site/social-card.ts.
  await cp(join(root, "site", CARD.file), join(out, CARD.file));
  // Every schema at the address its $id names (https://intentset.org/spec/...),
  // so a validator that dereferences one finds it.
  await mkdir(join(out, "spec"), { recursive: true });
  for (const name of (await readdir(join(root, "spec"))).filter((f) => f.endsWith(".schema.json")).sort()) {
    await cp(join(root, "spec", name), join(out, "spec", name));
  }
  // For agents: the guide as a file, and llms.txt, the conventional place an
  // agent looks first on a site, pointing at it.
  await writeFile(join(out, "guide.md"), siteGuide());
  await writeFile(join(out, "llms.txt"), llmsTxt());
  await writeFile(join(out, "robots.txt"), robotsTxt());

  const metas = await Promise.all(
    SPECS.map(async (spec) => {
      const file = join("spec", spec.file);
      return readSpecMeta(await readFile(join(root, file), "utf8"), file);
    }),
  );
  const specs = await Promise.all(SPECS.map((spec, i) => specPage(spec, metas[i])));
  const records = await loadRecords(join(root, EXAMPLE_DIR));
  // The specifications index's cards: each document's title and status line,
  // from its frontmatter. `spec.core.title`, `spec.core.meta`, and so on.
  const specTokens: Record<string, string> = {};
  for (const [i, spec] of SPECS.entries()) {
    specTokens[`spec.${spec.slug}.title`] = cardTitle(metas[i]);
    specTokens[`spec.${spec.slug}.meta`] = cardMeta(metas[i]);
  }
  const tokens = {
    ...specTokens,
    repo: REPO,
    markset: EXTERNAL.markset,
    coral: EXTERNAL.coralReef,
    version: VERSION,
    // The command's own help, so the CLI page cannot drift from it.
    usage: USAGE,
    // The Markset page's CTA points into the Core specification's section on
    // Markset profiles. The anchor is read from the rendered document rather
    // than written by hand, so renumbering the section cannot break the link.
    coreMarksetSection: sectionAnchor(specs[0], /markset/i),
  };
  const pages: Page[] = [
    ...(await Promise.all(CONTENT_PAGES.map(([path, file]) => contentPage(path, file, tokens)))),
    ...specs,
    guidePage(),
    await conformancePage(),
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
  await writeFile(join(out, "sitemap.xml"), sitemapXml(written));
  return written;
}

/** /llms.txt: what an agent needs to keep a model, and where the guide is. */
function llmsTxt(): string {
  const site = CANONICAL.replace(/\/$/, "");
  return `# ${SITE_NAME}

> Product intent, behavior, implementation ownership, verification and published knowledge, kept connected as
> readable Markdown records in the repository. The records are written by the coding agents that change the code and
> reviewed by people.

To keep a repository's model current, read the agent guide and follow it. In a repository that has run
\`intentset init\`, the same guide is at \`.intentset/agents.md\` with the repository's own scope: read that copy
when it exists. The records are Markset documents, so Markset's authoring guide covers their syntax.

- [Agent guide](${site}/guide.md): before and after a change, the record format, and what an agent never does
- [Specifications](${site}/specifications/): the source of truth
- [The intentset command](${site}/tools/cli/): every command, option and exit code
- [Markset authoring guide](${EXTERNAL.markset}guide.md): the document syntax the records are written in
`;
}

/** /robots.txt: everything may be crawled, and the sitemap says what there is. */
function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", CANONICAL).href}\n`;
}

/**
 * /sitemap.xml: every page the build wrote, at its canonical address, and
 * nothing else. No lastmod: a build cannot know when a page last changed, and
 * one stamped with the build's own date claims every page changed every time.
 */
function sitemapXml(paths: string[]): string {
  const urls = paths
    .filter((path) => path !== NOT_FOUND)
    .sort()
    .map((path) => `<url><loc>${esc(canonicalUrl(path))}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------

/** Content pages long enough to want the contents rail the specifications have. */
const RAIL_PAGES = new Set([
  "how-it-works/index.html",
  "adopt/index.html",
  "pilot/index.html",
  "start/index.html",
  "tools/index.html",
]);

/** A content page: site/content/<file>, tokens substituted, rendered and wrapped. */
async function contentPage(path: string, file: string, tokens: Record<string, string>): Promise<Page> {
  const source = join(root, "site", "content", file);
  let text = await readFile(source, "utf8");
  for (const [name, value] of Object.entries(tokens)) text = text.replaceAll(`{{${name}}}`, value);
  const leftover = /\{\{[\w.-]+\}\}/.exec(text);
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
async function specPage(spec: { slug: string; file: string }, meta: SpecMeta): Promise<Page> {
  return documentPage(`specifications/${spec.slug}/index.html`, join("spec", spec.file), meta);
}

/**
 * A page rendered from a document elsewhere carries a line saying where it comes
 * from. It goes under the h1, not above it: a reader meets the page's name
 * first, and a paragraph ahead of the title reads as text nobody introduced.
 */
export function underHeading(body: string, banner: string): string {
  const end = body.indexOf("</h1>");
  return end === -1 ? body + banner : `${body.slice(0, end + 5)}\n${banner}${body.slice(end + 5)}`;
}

async function documentPage(path: string, file: string, meta: SpecMeta): Promise<Page> {
  const absolute = join(root, file);
  const parsed = parseDocument(await readFile(absolute, "utf8"));
  failOnErrors(parsed.diagnostics, absolute);
  rewriteLinks(parsed.ast, file);
  const ast = addHeadingIds(parsed.ast);
  const banner = `<p class="site-source"><span class="ms-span badge">${esc(statusLabel(meta.status))}</span> <code>${esc(meta.id)}</code> · revision ${esc(meta.revision)} · implemented by ${esc(meta.implementation)} · Rendered from <a href="${REPO}/blob/main/${file}"><code>${esc(file)}</code></a> in the repository.</p>\n`;
  return {
    path,
    title: firstHeading(ast) ?? basename(file, ".md"),
    description: firstParagraph(ast),
    body: underHeading(renderHtml(ast, { diagrams: false, charts: false }), banner),
    toc: tableOfContents(ast, 2, 3),
    bodyAttributes: bodyAttributes(ast.frontmatter ?? null),
  };
}

/** A card's heading on the specifications index: the document's title without the project's name. */
export function cardTitle(meta: SpecMeta): string {
  return meta.title.replace(/^Intentset /, "");
}

/** A card's status line, as Markset source: the status as a badge, the ID and the revision. */
export function cardMeta(meta: SpecMeta): string {
  return `[${md(statusLabel(meta.status))}]{.badge} \`${meta.id}\` · revision ${md(meta.revision)}`;
}

/**
 * The agent guide, rendered: the same text as /guide.md, with a line saying what
 * it is and where the file is.
 */
function guidePage(): Page {
  const page = renderPage("guide/index.html", siteGuide(), join(root, "packages", "cli", "src", "agents.ts"), {}, true);
  const banner = `<p class="site-source">The guide <code>intentset init</code> writes to <code>.intentset/agents.md</code>, generated by the same code, with <code>${esc(GUIDE_SCOPE)}</code> where your repository's scope goes. As a file for an agent: <a href="../guide.md">guide.md</a>.</p>\n`;
  return { ...page, body: underHeading(page.body, banner) };
}

interface Case {
  section: string;
  name: string;
  level?: string;
  valid?: boolean;
  diagnostics?: string[];
}

/** The order the conformance page lists the sections in: the specifications' order. */
const SUITE_SECTIONS = ["core", "vsa", "evidence", "export", "publication"];

/**
 * The conformance page, generated from tests/ so it cannot drift from the suite:
 * what each section holds, every code a case expects and how many cases expect
 * it, and the export consumer fixtures. Generated as Markset source and
 * rendered, like the example index. It does not render the cases themselves,
 * which are whole repository trees.
 */
async function conformancePage(): Promise<Page> {
  const files = (await readdir(join(root, "tests"))).filter((f) => f.endsWith(".json")).sort();
  const sections = new Map<string, Case[]>();
  for (const file of files) {
    sections.set(basename(file, ".json"), JSON.parse(await readFile(join(root, "tests", file), "utf8")) as Case[]);
  }
  const order = [...sections.keys()].sort(
    (a, b) => rank(SUITE_SECTIONS, a) - rank(SUITE_SECTIONS, b) || a.localeCompare(b),
  );
  const total = [...sections.values()].reduce((n, cases) => n + cases.length, 0);
  const sectionRows = order.map((name) => {
    const cases = sections.get(name) ?? [];
    const valid = cases.filter((c) => c.valid === true).length;
    const invalid = cases.filter((c) => c.valid === false).length;
    const codes = new Set(cases.flatMap((c) => c.diagnostics ?? []));
    return `| [\`${name}.json\`](${REPO}/blob/main/tests/${name}.json) | ${cases.length} | ${valid} | ${invalid} | ${codes.size} |`;
  });
  const codes = new Map<string, { sections: Set<string>; cases: number }>();
  for (const name of order) {
    for (const c of sections.get(name) ?? []) {
      for (const code of new Set(c.diagnostics ?? [])) {
        const entry = codes.get(code) ?? { sections: new Set<string>(), cases: 0 };
        entry.sections.add(name);
        entry.cases++;
        codes.set(code, entry);
      }
    }
  }
  const codeRows = [...codes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, entry]) => `| \`${code}\` | ${[...entry.sections].join(", ")} | ${entry.cases} |`);
  const manifest = JSON.parse(await readFile(join(root, "tests", "consumer", "manifest.json"), "utf8")) as {
    contract: string;
    cases: Array<{ expect: { accept: boolean } }>;
  };
  const accepted = manifest.cases.filter((c) => c.expect.accept).length;
  const source = `---
markset: 0
---

# The conformance suite.

{.lead}
Every check in the specifications is held to cases: ${total} of them in ${order.length} sections, each naming the diagnostics an implementation must report for one repository. They are published as data, for implementations that are not this one.

:::tabs
### npm
\`\`\`sh
npm install --save-dev @intentset/conformance-suite
\`\`\`

### pnpm
\`\`\`sh
pnpm add --save-dev @intentset/conformance-suite
\`\`\`
:::

The package holds the cases, the schemas and the worked example they are built from, and no code an implementation must use. A case's \`diagnostics\` are compared as a multiset of codes, errors and warnings alike; messages, locations and remediation are the implementation's own. The canonical copy is \`tests/\` in the [repository](${REPO}), where the reference implementation runs every case.

## Sections

| Section | Cases | Valid | Invalid | Codes |
|---|---|---|---|---|
${sectionRows.join("\n")}

## Every code a case expects

The number of cases that expect each code at least once. The [specifications](../specifications/index.html) define what each code means.

| Code | Sections | Cases |
|---|---|---|
${codeRows.join("\n")}

## Testing a consumer of the export

A tool that imports an export rather than producing one is checked against ${manifest.cases.length} envelopes for \`${manifest.contract}\`: ${accepted} it must accept and ${manifest.cases.length - accepted} it must reject. Every rejected envelope is an accepted one with one deliberate defect, and several are valid against the schema, so a schema validator alone is not a consumer. The [export contract](../specifications/export/index.html) says what a consumer checks.
`;
  return renderPage("conformance/index.html", source, join(root, "tests", "index.json"));
}

function rank(order: string[], name: string): number {
  const at = order.indexOf(name);
  return at === -1 ? order.length : at;
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
 * The acts the worked example is read in, each a step of the model's own chain,
 * with the records that belong to it. A reader who follows them in order has
 * followed one promise from the reason the product is changing to the sentence a
 * customer is shown. The page used to be thirteen headings over fifteen links,
 * which said what the records were called and nothing about what they do.
 */
export const EXAMPLE_ACTS: Array<{ title: string; lead: string; records: string[] }> = [
  {
    title: "Why the product is changing",
    lead: `A model starts with the reason rather than the feature. Lantern's intent is to take last-minute administrative work off teachers, and the outcome it should produce is less friction preparing an assignment. The outcome is not a slogan, because two measure records say how it will be judged: minutes a teacher spends preparing an assignment, read by an observed task study, and assignments scheduled a day or more ahead, read from product analytics. Each names its metric, baseline, target, window and source, so a reviewer can argue with the target. One baseline reads \`unknown\`, which is a thing a record is allowed to say and a thing a reviewer can see.`,
    records: ["PRD-LANTERN", "INT-PREPARE", "OUT-PREPARE", "MEAS-PREPARE-MINUTES", "MEAS-PREPARE-ADOPTION"],
  },
  {
    title: "What the product promises",
    lead: `The capability is the ability that persists: teachers prepare and distribute published assessments to classes. Under it sits the one behavior this example follows, and a behavior is written as a promise including how it fails — success records the schedule, and an invalid time, an unauthorized class or an unpublished assessment is rejected without creating one. Two rules govern it, each written once rather than copied into every behavior it constrains, and the scenario is a single worked case: it shows the promise, and does not prove every path. Read the behavior's last sentence: delivery tolerance, cancellation and retry are still draft decisions. A gap written down is a gap somebody can close.`,
    records: ["CAP-ASMT-ASSIGN", "BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE", "SCN-ASMT-SCHEDULE"],
  },
  {
    title: "Where the promise is delivered",
    lead: `One slice is accountable for the behavior, which is what makes a change to it reviewable: an agent handed this slice's context knows what it may touch. The contract is what another part of the product may rely on, and it says what a breaking change is, so a consumer is reviewed rather than surprised. The decision record carries the reasoning that would otherwise be lost in a pull request, and joined the model by gaining frontmatter, its text unchanged. The slice says plainly that its code paths are planned.`,
    records: ["SLICE-ASMT-SCHEDULE", "CONTRACT-ASMT-SCHEDULE", "ADR-ASMT-SEAM"],
  },
  {
    title: "How it is checked",
    lead: `One verification record defines the check: a manual pilot review of five cases, recording inputs, observed outputs, environment, commit, graph hash and reviewer. It states that the procedure has not been executed, and its expected result goes further — it cannot pass until the release-time tolerance is defined. That is the model reporting a hole in itself, which is the whole reason for writing checks down beside the promise they hold.`,
    records: ["TEST-ASMT-SCHEDULE"],
  },
  {
    title: "What a customer may be told",
    lead: `The knowledge record is the guidance a user would read, kept beside the behavior it explains rather than in a separate system that goes quietly out of date. It names the records it came from, so a change to the rule marks it for review before it is published again. This one is a draft, and publication denies by default, so nothing goes out until a person approves it.`,
    records: ["KB-ASMT-SCHEDULE"],
  },
];

/** A record's field table: its frontmatter as a reader reads it, the links included. */
function recordFields(record: ExampleRecord, ref: (id: string) => string): string {
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
  return ["| Field | Value |", "|---|---|", ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
}

/**
 * A record, open on the page rather than a link to somewhere else. Markset's
 * folding callout is a `<details>` with a `<summary>` (Markset §4.1), so a
 * reader sees the whole example at a glance and opens any record where it
 * stands, and it folds with no script, which `<main>` may not carry anyway.
 * The record's own `# Title` is dropped, because the summary already carries it
 * and a page has one h1; its sections are demoted to h4, under the act's h2.
 */
function foldedRecord(record: ExampleRecord, ref: (id: string) => string): string {
  const body = record.body
    .trim()
    .replace(/^#\s+.*\n*/, "")
    .replace(/^##(#*)\s/gm, "####$1 ");
  const inside = [
    recordFields(record, ref),
    body,
    `[Open \`${record.id}\` on a page of its own](${record.id}/index.html)`,
  ].join("\n\n");
  const quoted = inside
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
  return `{.record-fold}\n> [!NOTE]- \`${record.id}\` · ${md(record.title)}\n${quoted}`;
}

/**
 * The worked example: the five acts, each explained and then opened, in the
 * model's own order. Generated as Markset source and rendered, so the page is a
 * Markset document like every other one.
 */
function exampleIndex(records: ExampleRecord[]): Page {
  const byId = new Map(records.map((r) => [r.id, r]));
  const ids = new Set(records.map((r) => r.id));
  const ref = (id: string) => (ids.has(id) ? `[${id}](${id}/index.html)` : `\`${id}\``);
  const listed = new Set(EXAMPLE_ACTS.flatMap((act) => act.records));
  for (const record of records) {
    if (!listed.has(record.id)) throw new Error(`${record.id} is in the example but in no act of the walkthrough`);
  }
  const acts = EXAMPLE_ACTS.map((act, index) => {
    const folds = act.records.map((id) => {
      const record = byId.get(id);
      if (!record) throw new Error(`the walkthrough names ${id}, which the example does not hold`);
      return foldedRecord(record, ref);
    });
    return `## ${index + 1}. ${act.title}\n\n${act.lead}\n\n${folds.join("\n\n")}`;
  }).join("\n\n***\n\n");

  const types = new Set(records.map((r) => r.type)).size;
  const source = `---
markset: 0
---

{.eyebrow}
Worked example

# Schedule a student assessment

{.lead}
One capability of an invented product, written down the way Intentset asks for it: ${records.length} records, each a Markdown file a person reads in under a minute, which together connect a reason for the product to change to the code that would deliver it and the check that would hold it.

Every record is open on this page. Read the ${EXAMPLE_ACTS.length} steps in order and the chain closes; open any record to see exactly what a person writes and what an agent reads.

:::metrics
| Count | Value |
|---|---|
| Records | ${records.length} |
| Record types | ${types} |
| Behaviors | 1 |
| Records approved | 0 |
:::

> [!NOTE]
> Lantern is invented and nothing here runs. Every record is a draft, the code paths are planned rather than written, the check has not been executed and nothing has been published. What the example shows is the shape of a model and what it makes visible, not a verification report.

***

${acts}

***

## Try the same thing on your own code

Nothing above was written by hand for this site. It is the shape an agent produces when it reads a capability out of a repository that already has the code, the tests and the decisions: the [first capability modelled in Streamlane](../pilot/index.html) came out this way, and listed two rules with no test and three behaviors checked only in the browser.

[[Start with one capability](../start/index.html)]{.button .primary} [[See how it works](../how-it-works/index.html)]{.button}
`;
  return renderPage("example/index.html", source, join(root, EXAMPLE_DIR, "index.md"));
}

/** One record: its metadata as a card, then the document body, then a way back. */
function recordPage(record: ExampleRecord, records: ExampleRecord[]): Page {
  const ids = new Set(records.map((r) => r.id));
  const ref = (id: string) => (ids.has(id) ? `[${id}](../${id}/index.html)` : `\`${id}\``);
  const table = recordFields(record, ref);
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
[Back to the worked example](../index.html)
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

/**
 * Pages serves 404.html for any address it has nothing at, however deep, so a
 * relative link on it would resolve against the missing address. Its links are
 * written from the site's root path instead. Not with a `<base>`: that would
 * also resolve the skip link's `#main` against the root, and a keyboard user on
 * the 404 page would be sent to the home page.
 */
function fromRoot(html: string, rootPath: string): string {
  return html.replace(
    /\b(href|src)="(?![a-z][a-z0-9+.-]*:|\/|#)([^"]*)"/gi,
    (_, name: string, url: string) => `${name}="${rootPath}${url}"`,
  );
}

function shell(page: Page): string {
  const depth = page.path.split("/").length - 1;
  const notFound = page.path === NOT_FOUND;
  const rel = notFound ? new URL(CANONICAL).pathname : depth === 0 ? "./" : "../".repeat(depth);
  const section = railFor(page.path);
  const nav = NAV.map(([label, href]) => {
    // A bar item is current for its whole section, not just its own page, or
    // the bar goes blank the moment a reader follows the rail into one.
    const active = page.path === href || (section !== undefined && section.items[0][1] === href);
    return `<a href="${rel}${href}"${active ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  }).join("\n");
  const footerLinks = FOOTER_LINKS.map(
    ([label, href]) => `<a href="${rel}${href}"${page.path === href ? ' aria-current="page"' : ""}>${esc(label)}</a>`,
  ).join("\n");
  // Where am I, then what is on this page: the section first, because it
  // answers the question a reader arriving from a search result has.
  const sectionNav = section
    ? `<nav class="site-rail" aria-label="${esc(section.title)}"><p class="site-rail-title">${esc(section.title)}</p>\n<ul>\n${section.items
        .map(
          ([label, href]) =>
            `<li><a href="${rel}${href}"${href === page.path ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`,
        )
        .join("\n")}\n</ul></nav>\n`
    : "";
  const contentsNav = page.toc
    ? `<nav aria-label="Contents"><p class="site-rail-title">On this page</p>\n${page.toc}</nav>\n`
    : "";
  const rail = sectionNav || contentsNav ? `<aside class="site-toc">${sectionNav}${contentsNav}</aside>\n` : "";
  // The pattern all four sites share (Streamlane's): the home page is "Intentset
  // · what it is", every other page "Page · Intentset", and a heading's closing
  // period is dropped, since a title is a label rather than a sentence.
  const label = page.title.replace(/\.$/, "");
  const title = page.path === "index.html" ? `${SITE_NAME} · ${label}` : `${label} · ${SITE_NAME}`;
  const canonical = canonicalUrl(page.path);
  // The 404 page has no address of its own, and asks not to be indexed.
  const meta = notFound
    ? `<meta name="robots" content="noindex">\n`
    : `<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(cardUrl())}">
<meta property="og:image:width" content="${CARD.width}">
<meta property="og:image:height" content="${CARD.height}">
<meta property="og:image:alt" content="${esc(CARD_ALT)}">
<meta name="twitter:card" content="summary_large_image">
`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
${meta}<link rel="icon" type="image/svg+xml" href="${rel}icon.svg">
<link rel="stylesheet" href="${rel}css/markset.css">
<link rel="stylesheet" href="${rel}css/site.css">
</head>
<body${page.bodyAttributes}>
${SCHEME_SCRIPT}${COPY_SCRIPT}<a class="site-skip" href="#main">Skip to content</a>
<header class="site-header">
<a class="site-brand" href="${rel}index.html"><img class="site-mark" src="${rel}icon.svg" alt="" width="28" height="28">${SITE_NAME}</a>
<nav class="site-nav" aria-label="Main">
${nav}
</nav>
${SCHEME_CONTROL}</header>
<div class="site-layout${rail ? " has-rail" : ""}">
${rail}<main id="main" class="ms-document" tabindex="-1">
${notFound ? fromRoot(page.body, rel) : page.body}</main>
</div>
<footer class="site-footer">
<div>
<nav class="site-footer-nav" aria-label="Footer">
${footerLinks}
</nav>
<p><strong>${SITE_NAME}</strong> · ${esc(FOOTER.statement)} · <a href="${REPO}">${esc(FOOTER.repository)}</a> · <a href="${EXTERNAL.coralReef}">${esc(FOOTER.company)}</a> · Sibling project: <a href="${SIBLING.url}">${SIBLING.name}</a></p>
</div>
${FAMILY_MARK}</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------

/**
 * The network figure from coralreefventures.com, which draws the four
 * products as nodes: Markset's two, Intentset's two, Streamlane's one,
 * Driftline's one, and one unaffiliated. Here Intentset's nodes carry the
 * accent and the rest stay quiet: the family's mark, worn by one member. Inline so its colors
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

/**
 * The second and last script on a built page: a Copy button on every code block
 * in <main>. Like the scheme script it is chrome, written in the shell ahead of
 * <main>, so nothing rendered from a document carries a script and the built
 * HTML inside <main> still holds none.
 *
 * The button is created at runtime rather than rendered, so a reader with
 * scripting off is never shown a control that cannot work, and it is only
 * created where the clipboard is available. Each block is wrapped in a
 * positioned element because `pre` scrolls sideways (markset.css), so a button
 * placed inside it would scroll away with the code.
 */
export const COPY_SCRIPT = `<script>
(function () {
  var READY = "Copy";
  var DONE = "Copied";
  document.addEventListener("DOMContentLoaded", function () {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    var main = document.getElementById("main");
    if (!main) return;
    var blocks = main.querySelectorAll("pre > code");
    for (var i = 0; i < blocks.length; i++) {
      var pre = blocks[i].parentNode;
      var wrap = document.createElement("div");
      wrap.className = "site-code";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "site-copy";
      button.setAttribute("aria-live", "polite");
      button.appendChild(document.createTextNode(READY));
      wrap.appendChild(button);
    }
    main.addEventListener("click", function (event) {
      var button = event.target.closest ? event.target.closest(".site-copy") : null;
      if (!button) return;
      var code = button.parentNode.querySelector("pre > code");
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        if (button.timer) clearTimeout(button.timer);
        button.textContent = DONE;
        button.dataset.copied = "";
        button.timer = setTimeout(function () {
          button.textContent = READY;
          delete button.dataset.copied;
        }, 2000);
      }, function () {});
    });
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
