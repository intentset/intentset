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
 * The index is what a customer-facing tool may read (Core §10): the snapshot,
 * the request without its authorization flags, the published IDs, and the
 * number of artifacts excluded for each reason. It names nothing that was not
 * published.
 *
 * Deterministic: the same graph, request, snapshot and `publishedAt` give the
 * same bytes.
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
import { defaultStylesheetPath, renderPage } from "@markset-lang/render-html";
import { compareStrings } from "./diagnostic.ts";
import { type GeneratedDocument, type PublicationMeta, generateDocument } from "./generate.ts";
import { type HelpFile, helpFile } from "./help.ts";
import { type ExclusionReason, type Snapshot, project } from "./project.ts";
import { checkReferences, checkTitles } from "./references.ts";
import { type IndexedRequest, type PublicationRequest, admits, indexedRequest } from "./request.ts";
import type { ReviewStatus } from "./review.ts";

/** Why a document that passed the projection was still not published. */
export const REFUSAL_REASONS = ["reference", "title", "directive", "markset"] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export interface PublishOptions {
  snapshot: Snapshot;
  /** The publication timestamp written into every document; an input, so output is reproducible. */
  publishedAt: string;
  /** Also render each document as a complete HTML page with Markset's default stylesheet inlined. */
  renderHtml?: boolean;
  reviews?: ReadonlyMap<string, ReviewStatus>;
}

export interface PublishedDocument extends GeneratedDocument {
  html?: string;
}

export interface PublicationIndex {
  snapshot: Snapshot;
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
      if (options.renderHtml === true) document.html = renderDocument(document.markset, document.publication);
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
    index: {
      snapshot: { commit: options.snapshot.commit, graphHash: options.snapshot.graphHash },
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
  const page = renderPage(parseDocument(markset).ast, { stylesheet: { inline: defaultStylesheet() } });
  const meta = `<meta name="intentset-publication" content="${escapeAttribute(canonicalJson(publication))}">\n`;
  const anchor = '<meta charset="utf-8">\n';
  const at = page.indexOf(anchor);
  if (at === -1) throw new Error("render-html returned a page without a charset declaration");
  return page.slice(0, at + anchor.length) + meta + page.slice(at + anchor.length);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
