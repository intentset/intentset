/**
 * A record's own text, the reason its page exists, rendered as the Markset it is
 * written in. The body is parsed on its own, never spliced into a page's source,
 * so nothing in it can reach the page around it. Its title heading is dropped,
 * because the page's h1 already carries it, and its other headings move down one
 * level, under the page's "The record". Markset leaves raw HTML out of what it
 * renders; links are kept only where they are safe and lead somewhere from the
 * Atlas: web and mail addresses, and a relative link to another record's file,
 * which becomes that record's page. Any other link keeps its words and loses its
 * target, an image its picture for its words, and a code span holding a record's
 * ID becomes a link to that record's page.
 *
 * A body that does not parse cleanly is not rendered: the page shows it as
 * written, in a fence, and says why.
 */
import { posix } from "node:path";
import type { Artifact } from "@intentset/core";
import { parseDocument } from "@markset-lang/parser";
import { renderHtml } from "@markset-lang/render-html";
import type { Model } from "./model.ts";

/** Where the Atlas shows a record, relative to the Atlas's root. */
export function recordPath(id: string): string {
  return `records/${id}.html`;
}

/**
 * Turns a link between two Atlas pages into the address written on the page: `from` and `to` are paths from the
 * Atlas's root, and `to` may end in a fragment. The default is the relative path; intentset.org serves the pages
 * at addresses of its own and passes one that points at them.
 */
export type PageLink = (from: string, to: string) => string;

export const relativeLink: PageLink = (from, to) => {
  const [file, fragment] = to.split("#");
  const path = posix.relative(posix.dirname(from), file);
  return fragment === undefined ? path : `${path}#${fragment}`;
};

export type RecordText = { html: string } | { unparsed: string[] };

interface Node {
  type: string;
  depth?: number;
  url?: string;
  alt?: string | null;
  value?: string;
  children?: Node[];
}

const SAFE_URL = /^(?:https?:|mailto:)/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function recordText(model: Model, artifact: Artifact, link: PageLink = relativeLink): RecordText {
  const from = recordPath(artifact.meta.id);
  const body = artifact.body.replace(/^\s*#[ \t]+[^\n]*\n?/, "");
  const parsed = parseDocument(`---\nmarkset: 0\n---\n\n${body}`);
  const errors = parsed.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    const codes = [...new Set(errors.map((d) => d.code))].sort();
    return { unparsed: codes };
  }
  const recordFile = (url: string): string | null => {
    if (SCHEME.test(url) || url.startsWith("/") || url.startsWith("#")) return null;
    // A fragment is dropped: the record's headings take no ids on its page.
    const file = url.split("#")[0];
    let decoded: string;
    try {
      decoded = decodeURI(file);
    } catch {
      return null;
    }
    const target = model.byPath(posix.normalize(posix.join(posix.dirname(artifact.path), decoded)));
    return target === undefined ? null : link(from, recordPath(target));
  };
  const visit = (node: Node): Node[] => {
    if (node.type === "heading" && node.depth !== undefined) node.depth = Math.min(6, node.depth + 1);
    if (node.type === "inlineCode" && node.value !== undefined && model.get(node.value) !== undefined) {
      return [{ type: "link", url: link(from, recordPath(node.value)), children: [node] }];
    }
    if (node.type === "link" && node.url !== undefined && !SAFE_URL.test(node.url)) {
      const url = recordFile(node.url);
      if (url === null) return (node.children ?? []).flatMap(visit);
      node.url = url;
    }
    if (node.type === "image" && node.url !== undefined && !SAFE_URL.test(node.url)) {
      return node.alt ? [{ type: "text", value: node.alt }] : [];
    }
    if (node.type === "definition" && node.url !== undefined && !SAFE_URL.test(node.url)) {
      const url = recordFile(node.url);
      if (url === null) return [];
      node.url = url;
    }
    if (node.children !== undefined) node.children = node.children.flatMap(visit);
    return [node];
  };
  visit(parsed.ast as unknown as Node);
  // The page's own sections have ids; the record's headings do not take any, so neither can claim the other's.
  return { html: renderHtml(parsed.ast, { diagrams: false, headingIds: false }) };
}
