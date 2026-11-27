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
 * references, titles or Markset fail is not emitted. Links and titles are
 * checked against what is actually being published: a document that links to
 * one refused here is refused in turn, and a refused document no longer allows
 * its title in another's body (publication §4, ADR 0029). The checks repeat
 * over what is still published until a round refuses nothing. A request for
 * several audiences or roles is one run over everything any of them admits.
 *
 * Knowledge kept under review (publication §3, ADR 0027), when a request names
 * `keepUnderReview`, is checked in a second phase, after the current documents
 * are settled: a current document's titles and links count only current
 * documents, and a kept document's count every document published. So a
 * current document is never published, or refused, because of a kept one, and
 * a request with `keepUnderReview` publishes the same current documents, byte
 * for byte, as without it. Kept documents are returned apart, in
 * `keptUnderReview`, at `under-review/<ID>.md`, and the index lists them in
 * its own member: `documents` and `index.published` stay current only.
 *
 * The help file (help.ts) carries every published document's tips, keyed by
 * the ID each explains, and the documents that lead each surface a slice
 * declares (surfaces.ts), for a product's runtime. The slices whose surfaces
 * were left out are returned to the operator alone, in `omittedSurfaces`.
 *
 * The index is what a customer-facing tool may read (Core §10, publication §4):
 * its profile, the request without its authorization flags, the published
 * IDs, and the number of artifacts excluded for each reason. It names nothing
 * that was not published.
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
import {
  type CheckedRequest,
  type IndexedRequest,
  type PublicationRequest,
  admits,
  indexedRequest,
} from "./request.ts";
import { type ReviewStatus, reviewStatus } from "./review.ts";
import { type SnapshotFile, snapshotFile } from "./snapshot.ts";
import { type OmittedSurface, helpSurfaces } from "./surfaces.ts";
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

/** The attribute that wraps a kept document's HTML fragment, its one mark (publication §2). */
export const UNDER_REVIEW_FRAGMENT_ATTRIBUTE = "data-intentset-under-review";

/** The index's profile (publication §4): a reader refuses any other, and any member the spec does not list. */
export const PUBLICATION_INDEX_PROFILE = "intentset/publication-index/0.4";

/** The index, in the order it is written. */
export interface PublicationIndex {
  profile: typeof PUBLICATION_INDEX_PROFILE;
  /** The request without authorization flags, or null when it was refused. */
  request: IndexedRequest | null;
  published: string[];
  /** Exclusions by reason, keys sorted, zero counts left out. */
  excludedCounts: Record<string, number>;
  /** The documents kept under review (publication §3), sorted; always written, `[]` when none. */
  keptUnderReview: string[];
}

export interface PublishResult {
  /** The documents published as current, sorted by ID. */
  documents: PublishedDocument[];
  /**
   * The documents kept under review (publication §3, ADR 0027), sorted by ID, each at `under-review/<ID>.md`. Never in
   * `documents`, so a consumer that serves `documents` as current never meets one.
   */
  keptUnderReview: PublishedDocument[];
  index: PublicationIndex;
  /** The help file (spec/publication.md §5), or null when the request was refused. */
  help: HelpFile | null;
  /** The snapshot file (spec/publication.md §6): the only part of the result that names the snapshot. */
  snapshot: SnapshotFile;
  /**
   * The slices whose surfaces were left out of the help file, by ID and reason, for the operator (ADR 0028). Only
   * slices whose visibility the projection admits are recorded; it never enters the index, the help file, a document
   * or a chunk.
   */
  omittedSurfaces: OmittedSurface[];
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
  const keptDocuments: PublishedDocument[] = [];
  if (req !== null) {
    const keptIds = new Set(projection.keptUnderReview);
    const reviews = new Map<string, ReviewStatus>(options.reviews ?? []);
    const review = (artifact: Artifact): ReviewStatus => {
      let status = reviews.get(artifact.meta.id);
      if (status === undefined) {
        status = reviewStatus(graph, artifact);
        reviews.set(artifact.meta.id, status);
      }
      return status;
    };
    const generated = new Map<string, GeneratedDocument>();
    const generate = (candidates: readonly Artifact[], current: ReadonlySet<string> | null) => {
      const unrendered = new Map<string, RefusalReason>();
      for (const artifact of candidates) {
        const kept = current === null ? undefined : { review: review(artifact), current };
        const result = generateDocument(graph, artifact, req, options, kept);
        diagnostics.push(...result.diagnostics);
        if (result.document !== null) generated.set(artifact.meta.id, result.document);
        if (result.diagnostics.some((d) => d.code === "PUB004")) unrendered.set(artifact.meta.id, "directive");
        else if (result.document === null) unrendered.set(artifact.meta.id, "markset");
      }
      return unrendered;
    };

    // Phase one: the current documents, checked against the current documents alone.
    const currentCandidates = projection.eligible.filter((artifact) => !keptIds.has(artifact.meta.id));
    const currentRefused = checkPublished(
      graph,
      req,
      currentCandidates,
      generate(currentCandidates, null),
      diagnostics,
    );
    const current = new Set(
      currentCandidates.map((artifact) => artifact.meta.id).filter((id) => !currentRefused.has(id)),
    );
    // Phase two: the kept documents, checked against every document still published; the current set is fixed.
    const keptCandidates = projection.eligible.filter((artifact) => keptIds.has(artifact.meta.id));
    const keptRefused =
      keptCandidates.length === 0
        ? new Map<string, RefusalReason>()
        : checkPublished(
            graph,
            req,
            keptCandidates,
            generate(keptCandidates, current),
            diagnostics,
            currentCandidates.filter((artifact) => current.has(artifact.meta.id)),
          );
    const kept = new Set(keptCandidates.map((artifact) => artifact.meta.id).filter((id) => !keptRefused.has(id)));

    for (const reason of currentRefused.values()) count(reason);
    for (const reason of keptRefused.values()) count(reason);
    const render = (id: string, underReview: boolean): PublishedDocument => {
      const document: PublishedDocument = { ...(generated.get(id) as GeneratedDocument) };
      if (rendering === "page") document.html = renderDocument(document.markset, document.publication);
      else if (rendering === "fragment") {
        const fragment = renderFragment(document.markset);
        document.htmlFragment = underReview
          ? `<div ${UNDER_REVIEW_FRAGMENT_ATTRIBUTE}="true">\n${fragment}</div>\n`
          : fragment;
      }
      return document;
    };
    for (const id of [...current].sort(compareStrings)) documents.push(render(id, false));
    for (const id of [...kept].sort(compareStrings)) keptDocuments.push(render(id, true));
  }

  const excludedCounts: Record<string, number> = {};
  for (const reason of [...counts.keys()].sort(compareStrings)) excludedCounts[reason] = counts.get(reason) as number;
  const sorted = sortDiagnostics(diagnostics);
  return {
    documents,
    keptUnderReview: keptDocuments,
    help:
      req === null
        ? null
        : helpFile(
            graph,
            documents.map((document) => document.id),
            req,
            options,
            keptDocuments.map((document) => document.id),
          ),
    snapshot: snapshotFile(options.snapshot),
    omittedSurfaces:
      req === null
        ? []
        : helpSurfaces(
            graph,
            [...documents, ...keptDocuments].map((document) => document.id),
            req,
          ).omitted,
    index: {
      profile: PUBLICATION_INDEX_PROFILE,
      request: req === null ? null : indexedRequest(req),
      published: documents.map((document) => document.id),
      excludedCounts,
      keptUnderReview: keptDocuments.map((document) => document.id),
    },
    diagnostics: sorted,
    ok: !hasErrors(sorted),
  };
}

/**
 * The title and reference checks of publication §4, over what is still published, until a round refuses nothing.
 * Each round checks every document still published against the titles and IDs of the documents still published at
 * its start, and reports every problem it finds in the round that refuses it: the reason is `title` when a title
 * fails, else `reference`. A document whose Markset failed allows no title and is no link target from the first
 * round, in which it is checked once, so a document failing its title and its Markset keeps the reason `title`. A
 * document's own title is always allowed in its own body. The published set only shrinks, so the loop ends, and it iterates sorted IDs, so it is deterministic.
 * `settled` are documents already published and fixed, the current documents when kept ones are checked: their
 * titles are allowed and they are link targets, and nothing here refuses them.
 */
function checkPublished(
  graph: Graph,
  request: CheckedRequest,
  candidates: readonly Artifact[],
  unrendered: ReadonlyMap<string, RefusalReason>,
  diagnostics: Diagnostic[],
  settled: readonly Artifact[] = [],
): Map<string, RefusalReason> {
  const refused = new Map<string, RefusalReason>();
  const settledIds = settled.map((artifact) => artifact.meta.id);
  const settledTitles = settled.map((artifact) => artifact.meta.title.trim());
  let published = new Set(candidates.map((artifact) => artifact.meta.id).filter((id) => !unrendered.has(id)));
  let round: readonly Artifact[] = candidates;
  while (round.length > 0) {
    const allowedTitles = new Set([
      ...settledTitles,
      ...candidates.filter((artifact) => published.has(artifact.meta.id)).map((artifact) => artifact.meta.title.trim()),
    ]);
    const targets = new Set([...settledIds, ...published]);
    const failed = new Set<string>();
    for (const artifact of round) {
      const id = artifact.meta.id;
      const own = artifact.meta.title.trim();
      const allowed = allowedTitles.has(own) ? allowedTitles : new Set([...allowedTitles, own]);
      const titles = checkTitles(artifact, graph, request, allowed);
      const references = checkReferences(artifact, graph, request, targets);
      diagnostics.push(...titles, ...references);
      const reason = titles.length > 0 ? "title" : references.length > 0 ? "reference" : (unrendered.get(id) ?? null);
      if (reason === null) continue;
      refused.set(id, reason);
      if (published.has(id)) failed.add(id);
    }
    published = new Set([...published].filter((id) => !failed.has(id)));
    round = failed.size === 0 ? [] : candidates.filter((artifact) => published.has(artifact.meta.id));
  }
  return refused;
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
 * Markset source keeps. A document kept under review also carries
 * `<meta name="robots" content="noindex">` (publication §2).
 */
export function renderDocument(markset: string, publication: PublicationMeta): string {
  const page = renderPage(withSafeUrls(parseDocument(markset).ast), { stylesheet: { inline: defaultStylesheet() } });
  const robots = publication.underReview === true ? '<meta name="robots" content="noindex">\n' : "";
  const meta = `${robots}<meta name="intentset-publication" content="${escapeAttribute(canonicalJson(publication))}">\n`;
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
