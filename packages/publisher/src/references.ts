/**
 * References out of a knowledge body (Core §9, catalog P02).
 *
 * A published document may refer only to what its projection may show. Three
 * kinds of reference are found:
 *
 *   id    a bare artifact ID in the text, word-bounded, code included
 *   link  a Markdown link, image or definition, or an href/src in raw HTML,
 *         whose destination resolves to an artifact's file
 *   path  an artifact's repository path written out in the text
 *
 * An ID reference fails when the artifact's visibility is outside the
 * projection: the ID itself is then something this audience is not shown. A
 * link or path reference fails when the artifact is not published in this
 * projection, since the reader would be sent to, or told of, a canonical
 * file. The product the request names is not a leak when mentioned by ID.
 *
 * Separately, the text may not contain the title of an artifact the
 * projection does not admit (three or more words, case-sensitive, any run of
 * whitespace between words), unless that title is also the title of
 * something being published. That is PUB002.
 *
 * Every message names the referencing document and the referenced ID, and
 * never the referenced artifact's title or path.
 */
import { posix } from "node:path";
import { type Artifact, type Diagnostic, type Graph, ID_PATTERN } from "@intentset/core";
import { parseDocument } from "@markset-lang/parser";
import { bodyLineOffset, fileLocation, lineAt } from "./body.ts";
import { compareStrings, publicationDiagnostic } from "./diagnostic.ts";
import { type PublicationRequest, admits } from "./request.ts";

export type ReferenceKind = "id" | "link" | "path";

export interface Reference {
  /** The referenced artifact's ID. */
  id: string;
  via: ReferenceKind;
  /** 1-based line in the body. */
  line: number;
}

/** ID_PATTERN, unanchored and bounded so it does not match inside a longer token. */
const VIA_WORDS: Record<ReferenceKind, string> = { id: "ID", link: "link", path: "path" };

/** "ID", "ID and link", "ID, link and path". */
function listing(words: readonly string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const ID_IN_TEXT = new RegExp(`(?<![A-Za-z0-9_-])${ID_PATTERN.source.slice(1, -1)}(?![A-Za-z0-9_-])`, "g");
const HTML_TARGET = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Every reference from a knowledge body to another artifact in the graph, sorted by ID, kind, line. */
export function findReferences(artifact: Artifact, graph: Graph): Reference[] {
  const self = artifact.meta.id;
  const body = artifact.body;
  const found: Reference[] = [];
  const add = (id: string, via: ReferenceKind, line: number) => {
    if (id !== self && graph.artifacts.has(id)) found.push({ id, via, line });
  };

  for (const match of body.matchAll(ID_IN_TEXT)) add(match[0], "id", lineAt(body, match.index));

  const byPath = new Map<string, string>();
  for (const [id, other] of graph.artifacts) byPath.set(other.path, id);
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const n = node as {
      type?: string;
      url?: unknown;
      value?: unknown;
      position?: { start: { line: number } };
      children?: unknown[];
    };
    const line = n.position?.start.line ?? 1;
    const targets: string[] = [];
    if ((n.type === "link" || n.type === "image" || n.type === "definition") && typeof n.url === "string")
      targets.push(n.url);
    if (n.type === "html" && typeof n.value === "string") {
      for (const match of n.value.matchAll(HTML_TARGET)) targets.push(match[1] ?? match[2] ?? "");
    }
    for (const url of targets) {
      const path = resolveTarget(url, artifact.path);
      const id = path === null ? undefined : byPath.get(path);
      if (id !== undefined) add(id, "link", line);
    }
    for (const child of n.children ?? []) visit(child);
  };
  visit(parseDocument(body).ast);

  for (const [id, other] of graph.artifacts) {
    let from = 0;
    for (;;) {
      const index = body.indexOf(other.path, from);
      if (index === -1) break;
      const before = index === 0 ? "" : body[index - 1];
      const after = body[index + other.path.length] ?? "";
      if (!/[A-Za-z0-9_./-]/.test(before) && !/[A-Za-z0-9_/-]/.test(after)) {
        add(id, "path", lineAt(body, index));
        break;
      }
      from = index + 1;
    }
  }

  return found.sort((a, b) => compareStrings(a.id, b.id) || compareStrings(a.via, b.via) || a.line - b.line);
}

/**
 * Resolve a link destination against the linking document to a repository
 * path. Null for anything that is not a repository file: a URL with a scheme,
 * a protocol-relative URL, a fragment, or a path that leaves the repository.
 */
export function resolveTarget(url: string, fromPath: string): string | null {
  const trimmed = url.trim();
  if (
    trimmed === "" ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("//") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)
  ) {
    return null;
  }
  let target = trimmed.split("#")[0].split("?")[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    // A malformed escape is compared as written.
  }
  if (target === "") return null;
  const joined = target.startsWith("/") ? target.replace(/^\/+/, "") : posix.join(posix.dirname(fromPath), target);
  const normal = posix.normalize(joined);
  if (normal === ".." || normal.startsWith("../")) return null;
  return normal.replace(/^\.\//, "");
}

/**
 * CORE008 for each referenced artifact this projection may not show: one
 * diagnostic per referenced ID, at the first failing reference's line.
 */
export function checkReferences(
  artifact: Artifact,
  graph: Graph,
  request: PublicationRequest,
  published: ReadonlySet<string>,
): Diagnostic[] {
  const offset = bodyLineOffset(artifact);
  const failing = new Map<string, Reference[]>();
  for (const ref of findReferences(artifact, graph)) {
    const target = graph.artifacts.get(ref.id) as Artifact;
    const fails =
      ref.via === "id"
        ? ref.id !== request.product && !admits(request, target.meta.visibility)
        : !published.has(ref.id);
    if (!fails) continue;
    const list = failing.get(ref.id);
    if (list === undefined) failing.set(ref.id, [ref]);
    else list.push(ref);
  }
  const diagnostics: Diagnostic[] = [];
  for (const id of [...failing.keys()].sort(compareStrings)) {
    const refs = failing.get(id) as Reference[];
    const vias = [...new Set(refs.map((ref) => VIA_WORDS[ref.via]))];
    const first = Math.min(...refs.map((ref) => ref.line));
    diagnostics.push(
      publicationDiagnostic({
        code: "CORE008",
        artifact: artifact.meta.id,
        path: artifact.path,
        location: fileLocation(offset, first),
        message: `${artifact.meta.id} refers to ${id} by ${listing(vias)}, which this ${request.visibility} projection does not publish.`,
        remediation:
          "Remove the reference, or replace it with reviewed wording safe for this audience; a published document may refer only to what its projection shows (Core §9).",
      }),
    );
  }
  return diagnostics;
}

/**
 * PUB002 for each artifact outside the projection whose title (three or more
 * words) the body contains, unless that title is in `allowedTitles` (the
 * document's own and those of what is being published).
 */
export function checkTitles(
  artifact: Artifact,
  graph: Graph,
  request: PublicationRequest,
  allowedTitles: ReadonlySet<string>,
): Diagnostic[] {
  const offset = bodyLineOffset(artifact);
  const diagnostics: Diagnostic[] = [];
  for (const id of [...graph.artifacts.keys()].sort(compareStrings)) {
    const other = graph.artifacts.get(id) as Artifact;
    if (id === artifact.meta.id || admits(request, other.meta.visibility)) continue;
    const title = other.meta.title.trim();
    if (title.split(/\s+/).length < 3 || allowedTitles.has(title)) continue;
    const match = titlePattern(title).exec(artifact.body);
    if (match === null) continue;
    diagnostics.push(
      publicationDiagnostic({
        code: "PUB002",
        artifact: artifact.meta.id,
        path: artifact.path,
        location: fileLocation(offset, lineAt(artifact.body, match.index)),
        message: `${artifact.meta.id} contains the title of ${id}, which this ${request.visibility} projection does not admit.`,
        remediation:
          "Reword the guidance so it does not repeat the title of an artifact this audience may not see (Core §9).",
      }),
    );
  }
  return diagnostics;
}

/** The title as a case-sensitive pattern: any whitespace between words, word-bounded at either end that is a word character. */
export function titlePattern(title: string): RegExp {
  const words = title.trim().split(/\s+/).map(escapeRegExp);
  const start = /^[\p{L}\p{N}_]/u.test(title.trim()) ? "(?<![\\p{L}\\p{N}_])" : "";
  const end = /[\p{L}\p{N}_]$/u.test(title.trim()) ? "(?![\\p{L}\\p{N}_])" : "";
  return new RegExp(`${start}${words.join("\\s+")}${end}`, "u");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
