/**
 * The one place Markset is imported (CLAUDE.md invariant 8, ADR 0003).
 *
 * `marksetCarrier` turns a document into the `DocumentInput` core validates:
 * the raw frontmatter and its line, the headings outside code, and Markset's
 * own diagnostics with origin "syntax" so they are never mistaken for
 * semantic ones. `plainCarrier` in core produces the same shape without a
 * Markdown parser; a test asserts the two agree on every example.
 */
import type { Diagnostic, DocumentInput, Heading } from "@intentset/core";
import { parseDocument, type Diagnostic as MarksetDiagnostic } from "@markset-lang/parser";
import type { Nodes, Root } from "mdast";

/** The upstream version this adapter is written and tested against. Change it only with the pin in package.json. */
export const MARKSET_VERSION = "0.4.1";

export function marksetCarrier(path: string, source: string): DocumentInput {
  const parsed = parseDocument(source);
  const first = parsed.ast.children[0];
  const frontmatter =
    first?.type === "yaml" ? { text: first.value, line: (first.position?.start.line ?? 1) + 1 } : null;
  return {
    path,
    source,
    frontmatter,
    headings: collectHeadings(parsed.ast),
    syntax: parsed.diagnostics.map((d) => toDiagnostic(d, path, source)),
  };
}

/**
 * Headings in document order, at any depth except inside code and inside
 * blockquotes: a quoted heading is quoted text, not a section of this document.
 * Markset constructs (card, tabs, ...) are transparent, as they are to a reader.
 */
function collectHeadings(root: Root): Heading[] {
  const out: Heading[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "code" || node.type === "blockquote" || node.type === "yaml") return;
    if (node.type === "heading") {
      out.push({ depth: node.depth, text: plainText(node).trim(), line: node.position?.start.line ?? 0 });
      return;
    }
    if ("children" in node) for (const child of node.children) walk(child as Nodes);
  };
  walk(root);
  return out;
}

function plainText(node: Nodes): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value;
  if ("children" in node) return node.children.map((c) => plainText(c as Nodes)).join("");
  return "";
}

/** Markset reports offsets; the shared shape wants a line and column (ADR 0004). */
function toDiagnostic(d: MarksetDiagnostic, path: string, source: string): Diagnostic {
  return {
    code: d.code,
    severity: d.severity,
    origin: "syntax",
    artifact: null,
    path,
    location: lineColumn(source, d.start),
    message: d.message,
    remediation: "Fix the Markset syntax; see the Markset specification for the construct named in the message.",
  };
}

function lineColumn(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}
