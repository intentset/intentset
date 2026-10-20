/**
 * The worked example's Atlas: what `intentset serve` shows a team about its model, drawn from Lantern's records so it
 * can be published (decided 2026-10-15). The records are validated as the CLI validates them and handed to
 * `@intentset/atlas` with its `example` notice, which says on every page that the product is invented; a team's own
 * Atlas stays internal. No run evidence is supplied, because the example's check has not been executed, so the pages
 * show its verification as missing rather than as a pass. The snapshot names no commit: the pages describe the
 * example's records, not a commit of this repository.
 *
 * The site renders each page's Markset source in its own shell, under /example/atlas/, so the Atlas wears the bar,
 * the Examples rail and the site's addresses: `ownership.html` is served at `example/atlas/ownership/`. The map is
 * the example's landing page, named after it; the other five are its review pages.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  NAV as ATLAS_NAV,
  type AtlasInput,
  atlasMapLayout,
  buildAtlasSources,
  MAP_SCRIPT_FILE,
  mapHtml,
} from "@intentset/atlas";
import { graphHash, plainCarrier, readRegistries, validate } from "@intentset/core";

/** Where the Atlas's pages live on the site. */
export const ATLAS_ROOT = "example/atlas";

export interface ExampleAtlasPage {
  /** The page's path in the Atlas, e.g. `behaviors/BEH-ASMT-SCHEDULE.html`. */
  atlasPath: string;
  /** The site's output path, e.g. `example/atlas/behaviors/BEH-ASMT-SCHEDULE/index.html`. */
  path: string;
  /** The page's Markset source, as the Atlas wrote it. */
  source: string;
  /** The map's SVG and controls, with links at the site's addresses; only the map page has them (ADR 0015). */
  html?: string;
}

/** Where the site serves the map's one script and its styles, beside the Atlas's pages. */
export const ATLAS_MAP_SCRIPT = `${ATLAS_ROOT}/${MAP_SCRIPT_FILE}`;
export const ATLAS_MAP_STYLES = `${ATLAS_ROOT}/atlas-map.css`;

/** The site's output path for an Atlas page: `index.html` stays the root, `x/y.html` becomes `x/y/index.html`. */
export function atlasSitePath(atlasPath: string): string {
  return atlasPath === "index.html"
    ? `${ATLAS_ROOT}/index.html`
    : `${ATLAS_ROOT}/${atlasPath.replace(/\.html$/, "")}/index.html`;
}

/** The map: Lantern's landing page, where the Examples bar item and every way into the example lead (2026-10-20). */
export const ATLAS_MAP_PAGE = atlasSitePath("map.html");

/**
 * The Atlas's review pages in its own order, the map apart: the Examples rail lists them under Lantern. A behavior's
 * page is in the section without being in the list; the overview links each one.
 */
export const REVIEW_PAGES: Array<[string, string]> = ATLAS_NAV.filter(({ path }) => path !== "map.html").map(
  ({ path, label }): [string, string] => [label, atlasSitePath(path)],
);

/** The example at `exampleDir` (repository-relative `relativeDir`), validated and drawn as the Atlas's pages. */
export async function exampleAtlas(exampleDir: string, relativeDir: string): Promise<ExampleAtlasPage[]> {
  const registries = readRegistries(
    await readFile(join(exampleDir, "registries.yaml"), "utf8"),
    `${relativeDir}/registries.yaml`,
  ).registries;
  const names = (await readdir(exampleDir)).filter((name) => name.endsWith(".md")).sort();
  const inputs = await Promise.all(
    names.map(async (name) => plainCarrier(`${relativeDir}/${name}`, await readFile(join(exampleDir, name), "utf8"))),
  );
  const level = "L1" as const;
  const result = validate(inputs, registries, { level });
  const input: AtlasInput = {
    graph: result.graph,
    registries,
    diagnostics: result.diagnostics,
    snapshot: { commit: null, graphHash: graphHash(result.graph), scope: [`${relativeDir}/**`], level },
    evidence: null,
  };
  const sources = buildAtlasSources(input, { notice: "example" });
  const paths = new Set(sources.keys());
  const map = mapHtml(atlasMapLayout(input), "", (path) => atlasLink("map.html", path, paths));
  return [...sources].map(([atlasPath, source]) => ({
    atlasPath,
    path: atlasSitePath(atlasPath),
    source,
    ...(atlasPath === "map.html" ? { html: map } : {}),
  }));
}

/**
 * A link on an Atlas page, pointed at the site's address for the page it names. A link to another Atlas page becomes
 * a relative link between the two site paths, ending in the directory; anything else is left as it was.
 */
export function atlasLink(fromAtlasPath: string, url: string, atlasPaths: ReadonlySet<string>): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#") || url.startsWith("/")) return url;
  const [target, fragment] = url.split("#");
  const resolved = posix.normalize(posix.join(posix.dirname(fromAtlasPath), target));
  if (!atlasPaths.has(resolved)) return url;
  if (resolved === fromAtlasPath && fragment !== undefined) return `#${fragment}`;
  const from = posix.dirname(atlasSitePath(fromAtlasPath));
  const to = posix.dirname(atlasSitePath(resolved));
  const relative = posix.relative(from, to);
  const address = relative === "" ? "./" : `${relative}/`;
  return fragment === undefined ? address : `${address}#${fragment}`;
}
