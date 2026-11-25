/**
 * Publication (Core §9): project, check references, generate, render.
 *
 *   canonical files -> validated graph -> exact snapshot
 *     -> authorized audience projection (project.ts)
 *     -> reviewed knowledge (review.ts)
 *     -> references and titles checked (references.ts)
 *     -> generated Markset (generate.ts) -> HTML
 *
 * Selection happens before any text reaches a renderer. A document whose
 * references, titles or Markset fail is not emitted. Links are checked against
 * what is actually being published, so a document that links to one refused
 * here is refused in turn; this repeats until nothing more is refused.
 *
 * The help file (help.ts) carries every published document's tips, keyed by
 * the ID each explains, for a product's runtime.
 *
 * The index is what a customer-facing tool may read (Core §10): the request
 * without its authorization flags, the published IDs, and the number of
 * artifacts excluded for each reason. It names nothing that was not published.
 *
 * The snapshot file (snapshot.ts) is the one place a publication names the
 * commit and graph hash it was made from (ADR 0019, ADR 0021). Both move with
 * every commit that changes a record, so no document, chunk, index or help
 * file carries them: their bytes change only when what they say does.
 *
 * Deterministic: the same graph, request and `publishedAt` give the same
 * documents, index and help file, whatever the commit; the snapshot file is
 * the same bytes for the same snapshot.
 */
import { readFileSync } from "node:fs";
import {
  type Artifact,
  type Diagnostic,
  type Graph,
  type Registries,
  canonicalJson,
  hasErrors,
  sortDiagnostics,
} from "@intentset/core";
import { parseDocument } from "@markset-lang/parser";
import { addHeadingIds, defaultStylesheetPath, renderHtml, renderPage } from "@markset-lang/render-html";
import { compareStrings } from "./diagnostic.ts";
import { type GeneratedDocument, type PublicationMeta, generateDocument } from "./generate.ts";
import { type HelpFile, helpFile } from "./help.ts";
import { type ExclusionReason, type Snapshot, project } from "./project.ts";
import { checkReferences, checkTitles } from "./references.ts";
import { type IndexedRequest, type PublicationRequest, admits, indexedRequest } from "./request.ts";
import type { ReviewStatus } from "./review.ts";
import { type SnapshotFile, snapshotFile } from "./snapshot.ts";
import { withSafeUrls } from "./urls.ts";

/** Why a document that passed the projection was still not published. */
export const REFUSAL_REASONS = ["reference", "title", "directive", "markset"] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export interface PublishOptions {
  snapshot: Snapshot;
  /** The publication timestamp written into every document; an input, so output is reproducible. */
  publishedAt: string;
  /**
   * Also render each document as HTML (publication §2): `"page"`, or `true`, a complete page with Markset's default
   * stylesheet inlined, in `html`; `"fragment"` the page's content alone, without its title heading, in
   * `htmlFragment`. Absent or `false` renders nothing.
   */
  renderHtml?: HtmlRendering;
  reviews?: ReadonlyMap<string, ReviewStatus>;
}

/** How a publication renders HTML: `true` is `"page"`. */
export type HtmlRendering = boolean | "page" | "fragment";

export interface PublishedDocument extends GeneratedDocument {
  /** The complete page, when `renderHtml` is `"page"` or `true`. */
  html?: string;
  /** The page's content without its title heading, when `renderHtml` is `"fragment"`. */
  htmlFragment?: string;
}

export interface PublicationIndex {
  /** The request without authorization flags, or null when it was refused. */
  request: IndexedRequest | null;
  published: string[];
  /** Exclusions by reason, keys sorted, zero counts left out. */
  excludedCounts: Record<string, number>;
}

export interface PublishResult {
  documents: PublishedDocument[];
  index: PublicationIndex;
  /** The help file (spec/publication.md §5), or null when the request was refused. */
  help: HelpFile | null;
  /** The snapshot file (spec/publication.md §6): the only part of the result that names the snapshot. */
  snapshot: SnapshotFile;
  diagnostics: Diagnostic[];
  ok: boolean;
}

export function publish(
  graph: Graph,
  registries: Registries,
  request: PublicationRequest,
  options: PublishOptions,
): PublishResult {
  const projection = project(graph, registries, request, { snapshot: options.snapshot, reviews: options.reviews });
  const diagnostics = [...projection.diagnostics];
  const counts = new Map<string, number>();
  const count = (reason: ExclusionReason | RefusalReason) => counts.set(reason, (counts.get(reason) ?? 0) + 1);
  // Only what the projection could see is counted: a customer index that said
  // "not-knowledge: 12" would tell its reader how many internal records exist.
  // A refused request admits nothing, so it counts nothing (invariant 4).
  for (const exclusion of projection.excluded) {
    const visibility = graph.artifacts.get(exclusion.id)?.meta.visibility;
    if (projection.request !== null && visibility !== undefined && admits(projection.request, visibility)) {
      count(exclusion.reason);
    }
  }

  const rendering = htmlRendering(options.renderHtml);
  const req = projection.request;
  const documents: PublishedDocument[] = [];
  if (req !== null) {
    const candidates = projection.eligible;
    const allowedTitles = new Set(candidates.map((artifact) => artifact.meta.title.trim()));
    const refused = new Map<string, RefusalReason>();
    const generated = new Map<string, GeneratedDocument>();

    for (const artifact of candidates) {
      const titles = checkTitles(artifact, graph, req, allowedTitles);
      const result = generateDocument(graph, artifact, req, options);
      diagnostics.push(...titles, ...result.diagnostics);
      if (result.document !== null) generated.set(artifact.meta.id, result.document);
      if (titles.length > 0) refused.set(artifact.meta.id, "title");
      else if (result.diagnostics.some((d) => d.code === "PUB004")) refused.set(artifact.meta.id, "directive");
      else if (result.document === null) refused.set(artifact.meta.id, "markset");
    }

    let published = new Set(candidates.map((artifact) => artifact.meta.id).filter((id) => !refused.has(id)));
    let round: Artifact[] = candidates;
    while (round.length > 0) {
      const failed: string[] = [];
      for (const artifact of round) {
        const found = checkReferences(artifact, graph, req, published);
        if (found.length === 0) continue;
        diagnostics.push(...found);
        failed.push(artifact.meta.id);
        refused.set(artifact.meta.id, "reference");
      }
      published = new Set([...published].filter((id) => !failed.includes(id)));
      round = failed.length === 0 ? [] : candidates.filter((artifact) => published.has(artifact.meta.id));
    }

    for (const reason of refused.values()) count(reason);
    for (const id of [...published].sort(compareStrings)) {
      const document: PublishedDocument = { ...(generated.get(id) as GeneratedDocument) };
      if (rendering === "page") document.html = renderDocument(document.markset, document.publication);
      else if (rendering === "fragment") document.htmlFragment = renderFragment(document.markset);
      documents.push(document);
    }
  }

  const excludedCounts: Record<string, number> = {};
  for (const reason of [...counts.keys()].sort(compareStrings)) excludedCounts[reason] = counts.get(reason) as number;
  const sorted = sortDiagnostics(diagnostics);
  return {
    documents,
    help:
      req === null
        ? null
        : helpFile(
            graph,
            documents.map((document) => document.id),
            req,
            options,
          ),
    snapshot: snapshotFile(options.snapshot),
    index: {
      request: req === null ? null : indexedRequest(req),
      published: documents.map((document) => document.id),
      excludedCounts,
    },
    diagnostics: sorted,
    ok: !hasErrors(sorted),
  };
}

let stylesheet: string | null = null;

/** Markset's default stylesheet, read once. */
function defaultStylesheet(): string {
  stylesheet ??= readFileSync(defaultStylesheetPath, "utf8");
  return stylesheet;
}

/**
 * A complete page through render-html, with the provenance block carried into
 * the head, after the charset, as one `<meta name="intentset-publication">`
 * whose content is the block's canonical JSON, so the HTML keeps what the
 * Markset source keeps.
 */
export function renderDocument(markset: string, publication: PublicationMeta): string {
  const page = renderPage(withSafeUrls(parseDocument(markset).ast), { stylesheet: { inline: defaultStylesheet() } });
  const meta = `<meta name="intentset-publication" content="${escapeAttribute(canonicalJson(publication))}">\n`;
  const anchor = '<meta charset="utf-8">\n';
  const at = page.indexOf(anchor);
  if (at === -1) throw new Error("render-html returned a page without a charset declaration");
  return page.slice(0, at + anchor.length) + meta + page.slice(at + anchor.length);
}

/**
 * The page's content alone, for a product that shows the document inside its
 * own interface (publication §2): what render-html puts inside the page's
 * `<main>`, through the same renderer with the same options, so it is
 * sanitized the same way (raw HTML in the source is dropped), with no
 * stylesheet, no `<html>`, `<head>` or `<body>`, and no provenance, which is
 * on `PublishedDocument.publication`. The first level-one heading at the top
 * of the tree, the one the page takes its `<title>` from, is left out: the
 * title is already on the document. Heading ids are assigned before it is
 * removed, so every section keeps the id it has in the page.
 */
export function renderFragment(markset: string): string {
  const tree = addHeadingIds(withSafeUrls(parseDocument(markset).ast));
  const title = tree.children.findIndex((node) => node.type === "heading" && node.depth === 1);
  const children = tree.children.filter((_, index) => index !== title);
  return renderHtml({ ...tree, children }, { headingIds: false });
}

function htmlRendering(value: HtmlRendering | undefined): "page" | "fragment" | null {
  if (value === undefined || value === false) return null;
  if (value === true || value === "page") return "page";
  if (value === "fragment") return "fragment";
  throw new Error(`renderHtml ${JSON.stringify(value)}: give true, false, "page" or "fragment"`);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
