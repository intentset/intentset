/**
 * @intentset/atlas: static review pages over a validated graph (Core §10,
 * milestone M4). Product and capability overview, behavior detail,
 * engineering ownership, verification status, publication readiness and
 * diagnostics.
 *
 * Every page is generated as Markset source, with `markset: 0` and a derived
 * `intentset/atlas/0.1` block in its frontmatter, then parsed back and
 * rendered by render-html, the way Markset's own site builds its generated
 * pages. A page that does not parse cleanly throws: that is a bug here, not
 * something a record can cause, because every value from a record is escaped
 * before it is written. The pages share one shell, link to each other
 * relatively, carry no script, and use Markset's default stylesheet, copied
 * once as `atlas.css`.
 *
 * The Atlas is internal: every page says it may hold internal and restricted
 * records and is not for publication, and states the snapshot it describes.
 * Every count names its denominator and whether it measures links or
 * evidence; without run evidence the pages say so rather than show a pass.
 * Deterministic: the same input gives the same bytes.
 */
import { readFileSync } from "node:fs";
import { graphHash } from "@intentset/core";
import { defaultStylesheetPath } from "@markset-lang/render-html";
import { Model } from "./model.ts";
import { atlasMeta, type PageSource, pageSource, STYLESHEET, shell } from "./page.ts";
import { behaviorPage } from "./pages/behavior.ts";
import { diagnosticsPage } from "./pages/diagnostics.ts";
import { overviewPage } from "./pages/overview.ts";
import { ownershipPage } from "./pages/ownership.ts";
import { publicationPage } from "./pages/publication.ts";
import { verificationPage } from "./pages/verification.ts";
import type { AtlasInput, AtlasOptions } from "./types.ts";

export { ATLAS_KEY, ATLAS_PROFILE, type AtlasMeta, NAV, STYLESHEET, snapshotLine } from "./page.ts";
export { STATUS_WORDS } from "./model.ts";
export type * from "./types.ts";

export const DEFAULT_TITLE = "Intentset Atlas";

/** The pages, in a fixed order: the five top-level pages, then one per behavior by ID. */
function pages(input: AtlasInput): PageSource[] {
  if (graphHash(input.graph) !== input.snapshot.graphHash) {
    throw new Error(
      "atlas: the snapshot's graph hash is not the hash of the graph given; the Atlas must state the snapshot it shows",
    );
  }
  const model = new Model(input);
  return [
    overviewPage(model),
    ownershipPage(model),
    verificationPage(model),
    publicationPage(model),
    diagnosticsPage(model),
    ...model.ofType("behavior").map((behavior) => behaviorPage(model, behavior)),
  ];
}

/** Every page's Markset source, by the relative path of the HTML it renders to. */
export function buildAtlasSources(input: AtlasInput): Map<string, string> {
  const meta = atlasMeta(input.snapshot);
  return new Map(pages(input).map((page) => [page.path, pageSource(page, meta)]));
}

let stylesheet: string | null = null;

/** The Atlas: relative path to file contents, every page as HTML plus `atlas.css`. */
export function buildAtlas(input: AtlasInput, options: AtlasOptions = {}): Map<string, string> {
  const meta = atlasMeta(input.snapshot);
  const title = options.title ?? DEFAULT_TITLE;
  const out = new Map<string, string>();
  for (const page of pages(input)) out.set(page.path, shell(page, pageSource(page, meta), meta, title));
  stylesheet ??= readFileSync(defaultStylesheetPath, "utf8");
  out.set(STYLESHEET, stylesheet);
  return out;
}
