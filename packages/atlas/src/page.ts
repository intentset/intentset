/**
 * One Atlas page: Markset source with the generated `intentset/atlas/0.2`
 * block in its frontmatter, the internal banner and the snapshot line at the
 * top, parsed back and rendered by render-html, then placed in the shared
 * shell. The Markset parse is the check: a page that does not parse cleanly
 * is a generation bug, and throws rather than shipping broken markup.
 */
import { canonicalJson } from "@intentset/core";
import { emitYaml, type YamlValue } from "@intentset/publisher";
import { parseDocument } from "@markset-lang/parser";
import { renderHtml } from "@markset-lang/render-html";
import { code, escapeHtml, text } from "./text.ts";
import type { AtlasNotice, AtlasSnapshot } from "./types.ts";

export const ATLAS_PROFILE = "intentset/atlas/0.2";
/** The top-level frontmatter key of an Atlas page; never `intentset`, so no page reads as a canonical record. */
export const ATLAS_KEY = "intentset-atlas";
export const STYLESHEET = "atlas.css";

export interface AtlasMeta {
  profile: typeof ATLAS_PROFILE;
  derived: true;
  snapshot: AtlasSnapshot;
}

export interface PageSource {
  /** Relative output path, e.g. `behaviors/BEH-X.html`. */
  path: string;
  /** The page's level-one heading and `<title>`. */
  title: string;
  /** Markset source after the header. */
  body: string[];
  /**
   * HTML Markset cannot write, the map's SVG, placed where the source's map slot is (`MAP_SLOT_SOURCE`), or after the
   * rendered source when it has none. Built here, never from a record's text unescaped.
   */
  html?: string;
  /** Scripts the page loads, relative to the Atlas's root, after `<main>`. Only the map has one (ADR 0015). */
  scripts?: string[];
}

/**
 * Where a page's HTML goes in its Markset source: a classed thematic break, so a reader of the source alone (or a
 * renderer that does not place the map) sees a rule where the map would stand.
 */
export const MAP_SLOT_SOURCE: readonly string[] = ["{.am-slot}", "***"];
/** The slot as render-html writes it. */
export const MAP_SLOT = '<hr class="am-slot">';

/** A rendered page with its HTML in the map slot, or after it when the page has no slot. */
export function placeHtml(rendered: string, html: string): string {
  if (html === "") return rendered;
  const at = rendered.indexOf(MAP_SLOT);
  return at === -1 ? rendered + html : rendered.slice(0, at) + html + rendered.slice(at + MAP_SLOT.length);
}

/** The pages every page's navigation lists, in order. */
export const NAV: readonly { path: string; label: string }[] = [
  { path: "index.html", label: "Overview" },
  { path: "ownership.html", label: "Ownership" },
  { path: "verification.html", label: "Verification" },
  { path: "publication.html", label: "Publication" },
  { path: "diagnostics.html", label: "Diagnostics" },
  { path: "map.html", label: "Map" },
];

/** The relative prefix from a page back to the Atlas root: "" or "../". */
export function rootOf(path: string): string {
  return "../".repeat(path.split("/").length - 1);
}

export function atlasMeta(snapshot: AtlasSnapshot): AtlasMeta {
  return {
    profile: ATLAS_PROFILE,
    derived: true,
    snapshot: {
      commit: snapshot.commit,
      graphHash: snapshot.graphHash,
      scope: [...snapshot.scope],
      level: snapshot.level,
    },
  };
}

/** The snapshot as one sentence: commit, graph hash prefix, level and scope. */
export function snapshotLine(snapshot: AtlasSnapshot): string {
  const commit = snapshot.commit === null ? "commit unknown" : `commit ${text(snapshot.commit.slice(0, 12))}`;
  const scope =
    snapshot.scope.length === 0
      ? "scope not declared (every Markdown file in the repository)"
      : `scope ${snapshot.scope.map(code).join(", ")}`;
  return `Snapshot: ${commit} · graph hash ${text(snapshot.graphHash.slice(0, 12))} · level ${text(snapshot.level)} · ${scope}`;
}

/** The notice every page opens with: internal unless the records are an invented example's. */
const NOTICES: Record<AtlasNotice, string[]> = {
  internal: [
    "> [!WARNING] Internal: not for publication",
    "> This Atlas is a derived view of the repository's records and may contain internal and restricted ones. " +
      "Keep it inside the organization. The files are authoritative; published knowledge comes only from the " +
      "publisher's projection, never from these pages.",
  ],
  example: [
    "> [!NOTE] An invented example",
    "> This Atlas is drawn from the records of an invented product, so it can be published to show what the Atlas " +
      "shows. A team's own Atlas may contain internal and restricted records and stays inside the organization. " +
      "The files are authoritative; these pages are a derived view of them.",
  ],
};

/** The complete Markset source of a page. */
export function pageSource(page: PageSource, meta: AtlasMeta, notice: AtlasNotice = "internal"): string {
  const yaml = emitYaml({ markset: 0, [ATLAS_KEY]: meta as unknown as YamlValue });
  return [
    "---",
    yaml.trimEnd(),
    "---",
    "<!-- Generated by intentset atlas; do not edit. -->",
    "",
    `# ${text(page.title)}`,
    "",
    ...NOTICES[notice],
    "",
    "{.small}",
    snapshotLine(meta.snapshot),
    "",
    ...page.body,
    "",
  ].join("\n");
}

/** Parse a page's source as Markset version 0, and refuse one that reports an error: that is a bug here. */
export function checkedTree(path: string, source: string): ReturnType<typeof parseDocument>["ast"] {
  const parsed = parseDocument(source);
  const errors = parsed.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0 || parsed.frontmatter?.markset !== 0) {
    const detail = errors.map((d) => `${d.code} at ${d.start}: ${d.message}`).join("; ");
    throw new Error(`atlas: generated page ${path} is not valid Markset version 0: ${detail || "no markset: 0"}`);
  }
  return parsed.ast;
}

/**
 * The shared shell: head with the atlas block as JSON, the navigation, and the rendered page in `<main>`. No script,
 * except the map page's one, after `<main>` (ADR 0015).
 */
export function shell(page: PageSource, source: string, meta: AtlasMeta, siteTitle: string): string {
  const root = rootOf(page.path);
  // Charts are drawn by render-html's built-in engine, inline and in front of the table they are drawn from, which
  // stays on the page; diagrams stay off, because their engines are commands outside this package.
  const body = renderHtml(checkedTree(page.path, source), { diagrams: false });
  const links = NAV.map(({ path, label }) => {
    const current = path === page.path ? ' aria-current="page"' : "";
    return `<a href="${root}${path}"${current}>${escapeHtml(label)}</a>`;
  });
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    `<meta name="${ATLAS_KEY}" content="${escapeHtml(canonicalJson(meta))}">`,
    `<title>${escapeHtml(page.title)} · ${escapeHtml(siteTitle)}</title>`,
    `<link rel="stylesheet" href="${root}${STYLESHEET}">`,
    "</head>",
    "<body>",
    '<header class="ms-document">',
    `<nav aria-label="Atlas pages"><p><strong>${escapeHtml(siteTitle)}</strong> · ${links.join(" · ")}</p></nav>`,
    "</header>",
    '<main class="ms-document">',
    `${placeHtml(body, page.html ?? "")}</main>`,
    ...(page.scripts ?? []).map((src) => `<script src="${root}${escapeHtml(src)}" defer></script>`),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
