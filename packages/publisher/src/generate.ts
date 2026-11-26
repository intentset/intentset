/**
 * Generated Markset for one published knowledge artifact (Core §9,
 * spec/publication.md).
 *
 * The document is the knowledge body, unchanged, under frontmatter that
 * carries `markset: 0` and a top-level `intentset-publication` block: the
 * generated profile `intentset/publication/0.3`, marked derived, with the
 * provenance Core §9 requires. It is a top-level key, not `intentset:`, so
 * nothing reads a generated document as a canonical record. A comment line
 * after the frontmatter says the same to a person opening the file.
 *
 * Provenance names only what the projection may show. The knowledge's own
 * path appears only in a projection that admits internal records; sources
 * outside the projection are counted, not named. `audience` and
 * `availability` are the request's whole entitlement, its audiences, roles
 * and flags as sorted lists (ADR 0029): the document's links and titles were
 * checked against everything published for that reader, so it is labeled for
 * that reader and no narrower one, and every document of a run carries the
 * same values as its help file and index. The block carries no snapshot: that
 * is the same for every document in a run and moves with any record in the
 * model, so the run names it once, in the snapshot file (publication §2, §6;
 * ADR 0019, ADR 0021), and a document's bytes change only when what it was
 * made from does.
 *
 * Knowledge kept under review (publication §2, §3, ADR 0027) is generated the
 * same way and marked: its block carries `underReview: true` and
 * `changedSinceReview`, it is written at `under-review/<ID>.md`, its body
 * carries a fixed note right after its title heading, and a relative link to a
 * document published as current is written with `../` before it, so it
 * resolves from `under-review/`. Nothing else is added to what was reviewed.
 *
 * The result is checked as Markset before it is emitted: a Markset error is
 * PUB003, and a `:::` directive outside Markset's vocabulary is PUB004
 * (CLAUDE.md invariant 5: profiles never add a directive).
 */
import type { Artifact, Diagnostic, Graph, Visibility } from "@intentset/core";
import { marksetCarrier } from "@intentset/markset-adapter";
import { BLOCK_DIRECTIVE_NAMES, parseDocument } from "@markset-lang/parser";
import { bodyLineOffset } from "./body.ts";
import { publicationDiagnostic, sortedUnique } from "./diagnostic.ts";
import { resolveTarget } from "./references.ts";
import { type CheckedRequest, admits } from "./request.ts";
import type { ReviewStatus } from "./review.ts";
import { type YamlValue, emitYaml } from "./yaml.ts";

export const PUBLICATION_PROFILE = "intentset/publication/0.3";
/** The top-level frontmatter key of a generated document. */
export const PUBLICATION_KEY = "intentset-publication";
/** The directory a document kept under review is written in, beside the current documents (publication §2). */
export const UNDER_REVIEW_DIR = "under-review";
/** The note a document kept under review carries right after its title heading, the same for every one (publication §2). */
export const UNDER_REVIEW_NOTE =
  "> [!NOTE]\n> Under review: what this article explains has changed since it was reviewed.\n";

/** What changed since review, on a document kept under review (publication §2): explained sources only. */
export interface ChangedSinceReview {
  /** Explained sources whose pins changed and that the projection admits, sorted. */
  changed: string[];
  /** How many explained sources whose pins changed the projection does not admit. */
  withheldChanged: number;
}

export interface SourceStamp {
  id: string;
  /** The artifact's `revision`, or null when it declares none. */
  revision: number | null;
  sourceHash: string;
}

/** The `intentset-publication` block, in the order it is written. */
export interface PublicationMeta {
  profile: typeof PUBLICATION_PROFILE;
  derived: true;
  /** The projection the document was generated for; the document is as restricted as that projection. */
  projection: Visibility;
  /** The knowledge itself; `path` only in a projection that admits internal records. */
  source: SourceStamp & { path?: string };
  /** Explained artifacts the projection admits, sorted by ID. */
  sources: SourceStamp[];
  /** How many explained artifacts are outside the projection and so not named. */
  withheldSources: number;
  /** The request's audiences, sorted: the reader is in every one (publication §1, §2). */
  audience: string[];
  /** The request's values, its roles and flags as sorted lists: the reader holds every one (publication §1, §2). */
  availability: { product: string; release: string; role: string[]; edition: string; flags: string[] };
  reviewer: string;
  reviewedAt: string;
  /** Only on a document kept under review (publication §2, §3): never written as false. */
  underReview?: true;
  /** Only on a document kept under review. */
  changedSinceReview?: ChangedSinceReview;
  publishedAt: string;
}

export interface GenerateOptions {
  publishedAt: string;
}

/** How to generate a document kept under review: its review status and the documents published as current. */
export interface KeptOptions {
  review: ReviewStatus;
  /** The IDs of the documents published as current in the run, whose links are written with `../` before them. */
  current: ReadonlySet<string>;
}

export interface GeneratedDocument {
  id: string;
  /** `<ID>.md`, or `under-review/<ID>.md` for a document kept under review. */
  path: string;
  markset: string;
  publication: PublicationMeta;
}

/** The line after the frontmatter that marks a generated file. */
export function markerLine(id: string): string {
  return `<!-- Generated by intentset publish from ${id}; do not edit. -->`;
}

/** The provenance block for a knowledge artifact already selected by the projection and current in review. */
export function publicationMeta(
  graph: Graph,
  artifact: Artifact,
  request: CheckedRequest,
  options: GenerateOptions,
): PublicationMeta {
  const { meta } = artifact;
  if (meta.reviewedBy === undefined || meta.reviewedAt === undefined) {
    throw new Error(`${meta.id} has no review; only knowledge the projection selected is generated`);
  }
  const source: PublicationMeta["source"] = {
    id: meta.id,
    revision: meta.revision ?? null,
    sourceHash: artifact.sourceHash,
  };
  if (admits(request, "internal")) source.path = artifact.path;
  const sources: SourceStamp[] = [];
  let withheldSources = 0;
  for (const id of sortedUnique(meta.links.explains ?? [])) {
    const explained = graph.artifacts.get(id);
    if (explained === undefined || !admits(request, explained.meta.visibility)) withheldSources++;
    else sources.push({ id, revision: explained.meta.revision ?? null, sourceHash: explained.sourceHash });
  }
  return {
    profile: PUBLICATION_PROFILE,
    derived: true,
    projection: request.visibility,
    source,
    sources,
    withheldSources,
    audience: sortedUnique(request.audience),
    availability: {
      product: request.product,
      release: request.release,
      role: sortedUnique(request.role),
      edition: request.edition,
      flags: sortedUnique(request.flags),
    },
    reviewer: meta.reviewedBy,
    reviewedAt: meta.reviewedAt,
    publishedAt: options.publishedAt,
  };
}

/** The provenance block of a document kept under review: the current block, marked, with what changed (publication §2). */
export function keptPublicationMeta(
  graph: Graph,
  artifact: Artifact,
  request: CheckedRequest,
  options: GenerateOptions,
  review: ReviewStatus,
): PublicationMeta {
  const { publishedAt, ...rest } = publicationMeta(graph, artifact, request, options);
  const changed = new Set(review.changed);
  const admitted: string[] = [];
  let withheldChanged = 0;
  for (const id of sortedUnique(artifact.meta.links.explains ?? [])) {
    if (!changed.has(id)) continue;
    const explained = graph.artifacts.get(id);
    if (explained !== undefined && admits(request, explained.meta.visibility)) admitted.push(id);
    else withheldChanged++;
  }
  return { ...rest, underReview: true, changedSinceReview: { changed: admitted, withheldChanged }, publishedAt };
}

/**
 * A kept document's body (publication §2): the note right after its title heading (first when it has none), and each
 * relative link whose target is a document published as current written with `../` before it. The note is a block of
 * its own: a blank line before it and one after it (the body's own, when one follows the title already), so no
 * paragraph of the article continues into it, and it goes after the title heading's last line, so a setext heading
 * stays whole. Returns the body, the body line after which the note was inserted (0 when first) and how many lines
 * were inserted.
 */
export function keptBody(
  artifact: Artifact,
  graph: Graph,
  current: ReadonlySet<string>,
): { body: string; noteAfterLine: number; noteLines: number } {
  const linked = prefixCurrentLinks(artifact, graph, current);
  const lines = linked.split("\n");
  const after = titleHeadingEndLine(linked);
  const note = UNDER_REVIEW_NOTE.replace(/\n$/, "").split("\n");
  const blankFollows = after < lines.length && lines[after].trim() === "";
  const inserted = after === 0 ? [...note, ""] : blankFollows ? ["", ...note] : ["", ...note, ""];
  return {
    body: [...lines.slice(0, after), ...inserted, ...lines.slice(after)].join("\n"),
    noteAfterLine: after,
    noteLines: inserted.length,
  };
}

/** The last body line of the title heading, the first level-one heading at the top level (publication §2), or 0. */
function titleHeadingEndLine(body: string): number {
  const root = parseDocument(body).ast as {
    children?: { type?: string; depth?: number; position?: { end: { line: number } } }[];
  };
  const title = (root.children ?? []).find((node) => node.type === "heading" && node.depth === 1);
  return title?.position?.end.line ?? 0;
}

/** The body with `../` before each Markdown link, image or definition destination that is a current document's file. */
function prefixCurrentLinks(artifact: Artifact, graph: Graph, current: ReadonlySet<string>): string {
  const body = artifact.body;
  const byPath = new Map<string, string>();
  for (const [id, other] of graph.artifacts) byPath.set(other.path, id);
  const inserts: number[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as {
      type?: string;
      url?: unknown;
      position?: { start: { offset?: number }; end: { offset?: number } };
      children?: { position?: { end: { offset?: number } } }[];
    };
    if ((n.type === "link" || n.type === "image" || n.type === "definition") && typeof n.url === "string") {
      const url = n.url.trim();
      const path = url.startsWith("/") ? null : resolveTarget(url, artifact.path);
      const id = path === null ? undefined : byPath.get(path);
      const start = n.position?.start.offset;
      const end = n.position?.end.offset;
      if (id !== undefined && current.has(id) && start !== undefined && end !== undefined) {
        const lastChild = n.children?.[n.children.length - 1]?.position?.end.offset ?? start;
        const at = destinationOffset(body, n.type, lastChild, end);
        if (at !== null && writtenDestinationIs(body, at, n.url)) inserts.push(at);
      }
    }
    for (const child of (n.children ?? []) as unknown[]) visit(child);
  };
  visit(parseDocument(body).ast);
  let out = body;
  for (const at of inserts.sort((a, b) => b - a)) out = `${out.slice(0, at)}../${out.slice(at)}`;
  return out;
}

/**
 * Whether the destination written at `at` is the one CommonMark decoded to `url`. The written destination runs to its
 * closing `>` in the angle form, otherwise to whitespace or the `)` that closes the link, and is decoded by parsing it
 * as a link of its own, so a backslash escape or a character reference anywhere in it, the file name included, reads
 * as it does in the article.
 */
function writtenDestinationIs(body: string, at: number, url: string): boolean {
  const angle = body[at - 1] === "<";
  let end = at;
  let depth = 0;
  for (; end < body.length; end++) {
    const c = body[end];
    if (c === "\\" && end + 1 < body.length) {
      end++;
      continue;
    }
    if (angle ? c === ">" || c === "\n" : /\s/.test(c)) break;
    if (!angle && c === "(") depth++;
    if (!angle && c === ")" && depth-- === 0) break;
  }
  const written = body.slice(at, end);
  if (written === "") return false;
  const link = (
    parseDocument(angle ? `[x](<${written}>)` : `[x](${written})`).ast as {
      children?: { children?: { type?: string; url?: unknown }[] }[];
    }
  ).children?.[0]?.children?.[0];
  return link?.type === "link" && link.url === url;
}

/** Where a link's destination starts in the body: after `](` (or `]:` for a definition), spaces and an opening `<`. */
function destinationOffset(body: string, type: string, from: number, end: number): number | null {
  const marker = type === "definition" ? "]:" : "](";
  const found = body.indexOf(marker, from);
  if (found === -1 || found >= end) return null;
  let at = found + marker.length;
  while (at < end && /[ \t\n]/.test(body[at])) at++;
  if (body[at] === "<") at++;
  return at;
}

/** The document text, and the 1-based line the body's first line lands on. */
export function marksetSource(publication: PublicationMeta, body: string): { source: string; bodyStartLine: number } {
  const yaml = emitYaml({ markset: 0, [PUBLICATION_KEY]: publication as unknown as YamlValue });
  const head = `---\n${yaml}---\n${markerLine(publication.source.id)}\n`;
  const separated = body.startsWith("\n");
  const headLines = head.split("\n").length - 1;
  return {
    source: separated ? head + body : `${head}\n${body}`,
    bodyStartLine: headLines + (separated ? 1 : 2),
  };
}

/** Generate and check one document. A document with any error is not returned. */
export function generateDocument(
  graph: Graph,
  artifact: Artifact,
  request: CheckedRequest,
  options: GenerateOptions,
  kept?: KeptOptions,
): { document: GeneratedDocument | null; diagnostics: Diagnostic[] } {
  const id = artifact.meta.id;
  const path = kept === undefined ? `${id}.md` : `${UNDER_REVIEW_DIR}/${id}.md`;
  let publication: PublicationMeta;
  let generated: { source: string; bodyStartLine: number };
  let note: { after: number; lines: number } | undefined;
  try {
    if (kept === undefined) {
      publication = publicationMeta(graph, artifact, request, options);
      generated = marksetSource(publication, artifact.body);
    } else {
      publication = keptPublicationMeta(graph, artifact, request, options, kept.review);
      const body = keptBody(artifact, graph, kept.current);
      note = { after: body.noteAfterLine, lines: body.noteLines };
      generated = marksetSource(publication, body.body);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      document: null,
      diagnostics: [
        publicationDiagnostic({
          code: "PUB003",
          artifact: id,
          path: artifact.path,
          message: `The generated document for ${id} could not be written as Markset: ${reason}.`,
          remediation: "Correct the metadata value named in the message; provenance is written in plain YAML scalars.",
        }),
      ],
    };
  }
  const diagnostics = checkGenerated(artifact, generated.source, generated.bodyStartLine, note);
  if (diagnostics.length > 0) return { document: null, diagnostics };
  return { document: { id, path, markset: generated.source, publication }, diagnostics };
}

/** PUB004 for a directive outside Markset's vocabulary, PUB003 for every other Markset error. */
export function checkGenerated(
  artifact: Artifact,
  source: string,
  bodyStartLine: number,
  note?: { after: number; lines: number },
): Diagnostic[] {
  const id = artifact.meta.id;
  const offset = bodyLineOffset(artifact);
  // A kept document's note adds `note.lines` body lines after `note.after`; a line in it is no line of the record.
  const locate = (line: number | undefined) => {
    if (line === undefined || offset === null || line < bodyStartLine) return undefined;
    let bodyLine = line - bodyStartLine + 1;
    if (note !== undefined && bodyLine > note.after) {
      if (bodyLine <= note.after + note.lines) return undefined;
      bodyLine -= note.lines;
    }
    return { line: bodyLine + offset };
  };
  const lines = source.split("\n");
  const parsed = parseDocument(source);
  const diagnostics: Diagnostic[] = [];

  const directiveLines = new Set<number>();
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as {
      type?: string;
      name?: string | null;
      position?: { start: { line: number } };
      children?: unknown[];
    };
    if (n.type === "directive") {
      const line = n.position?.start.line;
      const name =
        n.name ??
        (line === undefined ? null : (/^\s*:{3,}\s*([A-Za-z][A-Za-z0-9_-]*)/.exec(lines[line - 1])?.[1] ?? null));
      if (name !== null && !BLOCK_DIRECTIVE_NAMES.has(name)) {
        if (line !== undefined) directiveLines.add(line);
        diagnostics.push(
          publicationDiagnostic({
            code: "PUB004",
            artifact: id,
            path: artifact.path,
            location: locate(line),
            message: `${id} uses the directive :::${name}, which is not in Markset's vocabulary.`,
            remediation: `Use one of Markset's constructs (${[...BLOCK_DIRECTIVE_NAMES].join(", ")}) or plain Markdown; an Intentset profile never adds a directive (Core §9).`,
          }),
        );
      }
    }
    for (const child of n.children ?? []) visit(child);
  };
  visit(parsed.ast);

  if (parsed.frontmatter?.markset !== 0) {
    diagnostics.push(
      publicationDiagnostic({
        code: "PUB003",
        artifact: id,
        path: artifact.path,
        message: `The generated frontmatter for ${id} does not read as Markset version 0.`,
        remediation:
          "Report this as a publisher defect; the generated frontmatter must be readable by Markset's own reader.",
      }),
    );
  }
  for (const d of marksetCarrier(`${id}.md`, source).syntax) {
    if (d.severity !== "error" || (d.location !== undefined && directiveLines.has(d.location.line))) continue;
    diagnostics.push(
      publicationDiagnostic({
        code: "PUB003",
        artifact: id,
        path: artifact.path,
        location: locate(d.location?.line),
        message: `The generated document for ${id} is not valid Markset: ${d.code}, ${d.message.replace(/\.$/, "")}.`,
        remediation:
          "Fix the Markset syntax in the knowledge body; the document is not emitted until it parses without errors.",
      }),
    );
  }
  return diagnostics;
}
