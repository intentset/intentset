/**
 * @intentset/atlas: static review pages over a validated graph (Core §10,
 * milestone M4). Product and capability overview, every record on a page of
 * its own with its text first (a behavior's with its detail), engineering
 * ownership, verification status, publication readiness and diagnostics.
 *
 * Every page is generated as Markset source, with `markset: 0` and a derived
 * `intentset/atlas/0.2` block in its frontmatter, then parsed back and
 * rendered by render-html, the way Markset's own site builds its generated
 * pages. A page that does not parse cleanly throws: that is a bug here, not
 * something a record can cause, because every value from a record is escaped
 * before it is written. The pages share one shell, link to each other
 * relatively, carry no script, and use Markset's default stylesheet, copied
 * once as `atlas.css`.
 *
 * The Atlas is internal: every page says it may hold internal and restricted
 * records and is not for publication, and states the snapshot it describes.
 * The one exception is an invented example's Atlas (`notice: "example"`),
 * whose pages say the product is invented instead.
 * Every count names its denominator and whether it measures links or
 * evidence; without run evidence the pages say so rather than show a pass.
 * Deterministic: the same input gives the same bytes.
 */
import { readFileSync } from "node:fs";
import { type Artifact, compareStrings, graphHash } from "@intentset/core";
import { defaultStylesheetPath } from "@markset-lang/render-html";
import { Model } from "./model.ts";
import { type AtlasMapLayout, layoutMap, MAP_STYLES, mapHtml } from "./map.ts";
import { MAP_SCRIPT } from "./map-script.ts";
import { atlasMeta, type PageSource, pageSource, STYLESHEET, shell } from "./page.ts";
import { diagnosticsPage } from "./pages/diagnostics.ts";
import { mapPage } from "./pages/map.ts";
import { overviewPage } from "./pages/overview.ts";
import { ownershipPage } from "./pages/ownership.ts";
import { publicationPage } from "./pages/publication.ts";
import { recordPage } from "./pages/record.ts";
import { recordsPage } from "./pages/records.ts";
import { verificationPage } from "./pages/verification.ts";
import { type PageLink, relativeLink } from "./record-text.ts";
import type { AtlasInput, AtlasOptions } from "./types.ts";

export {
  ATLAS_KEY,
  ATLAS_PROFILE,
  type AtlasMeta,
  MAP_SLOT,
  NAV,
  placeHtml,
  STYLESHEET,
  snapshotLine,
} from "./page.ts";
export { STATUS_WORDS } from "./model.ts";
export { type AtlasMapLayout, GROUPS, MAP_STYLES, type MapEdge, type MapNode, mapHtml } from "./map.ts";
export { MAP_SCRIPT } from "./map-script.ts";
export { type PageLink, recordPath, relativeLink } from "./record-text.ts";

/** The map's script, as the Atlas writes it beside the pages. */
export const MAP_SCRIPT_FILE = "atlas-map.js";
export type * from "./types.ts";

export const DEFAULT_TITLE = "Intentset Atlas";

/** The pages, in a fixed order: the navigation's pages, then one per record by ID. */
function pages(input: AtlasInput, pageLink: PageLink = relativeLink): PageSource[] {
  if (graphHash(input.graph) !== input.snapshot.graphHash) {
    throw new Error(
      "atlas: the snapshot's graph hash is not the hash of the graph given; the Atlas must state the snapshot it shows",
    );
  }
  const model = new Model(input);
  const layout = layoutMap(model);
  return [
    overviewPage(model),
    recordsPage(model),
    ownershipPage(model),
    verificationPage(model),
    publicationPage(model),
    diagnosticsPage(model),
    { ...mapPage(layout), html: mapHtml(layout) },
    ...[...model.graph.artifacts.keys()]
      .sort(compareStrings)
      .map((id) => recordPage(model, model.get(id) as Artifact, pageLink)),
  ];
}

/** The map's layout, for a caller that places the map in a shell of its own, as intentset.org does. */
export function atlasMapLayout(input: AtlasInput): AtlasMapLayout {
  return layoutMap(new Model(input));
}

/** Every page's Markset source, by the relative path of the HTML it renders to. */
export function buildAtlasSources(input: AtlasInput, options: AtlasOptions = {}): Map<string, string> {
  return new Map(buildAtlasPages(input, options).map((page) => [page.path, page.source]));
}

/** One page for a caller that renders the Markset in a shell of its own, as intentset.org does. */
export interface AtlasPage {
  path: string;
  source: string;
  /** HTML for the source's slot (`placeHtml`): a record's text. The map's comes from `mapHtml`. */
  html?: string;
}

/**
 * Every page's Markset source, with the HTML a record's page places in its slot. `link` writes the address of one
 * Atlas page on another, in that HTML; the source's own links are relative, for the caller to point.
 */
export function buildAtlasPages(input: AtlasInput, options: AtlasOptions & { link?: PageLink } = {}): AtlasPage[] {
  const meta = atlasMeta(input.snapshot);
  return pages(input, options.link).map((page) => ({
    path: page.path,
    source: pageSource(page, meta, options.notice),
    ...(page.html === undefined || page.path === "map.html" ? {} : { html: page.html }),
  }));
}

let stylesheet: string | null = null;

/**
 * What the Atlas adds to Markset's default stylesheet: a grid item that holds one card lets the card be the surface,
 * as intentset.org's stylesheet does, so the card keeps its tone; and a long path in a card wraps inside it.
 */
const ATLAS_STYLES = `
/* Intentset Atlas */
.ms-grid-item:has(> .ms-card:only-child) { border: 0; padding: 0; background: none; }
.ms-grid-item > .ms-card { height: 100%; box-sizing: border-box; }
.ms-grid-item code { overflow-wrap: anywhere; }
`;

/** The Atlas: relative path to file contents, every page as HTML plus `atlas.css`. */
export function buildAtlas(input: AtlasInput, options: AtlasOptions = {}): Map<string, string> {
  const meta = atlasMeta(input.snapshot);
  const title = options.title ?? DEFAULT_TITLE;
  const out = new Map<string, string>();
  for (const page of pages(input)) out.set(page.path, shell(page, pageSource(page, meta, options.notice), meta, title));
  stylesheet ??= readFileSync(defaultStylesheetPath, "utf8") + ATLAS_STYLES + MAP_STYLES;
  out.set(STYLESHEET, stylesheet);
  out.set(MAP_SCRIPT_FILE, MAP_SCRIPT);
  return out;
}
