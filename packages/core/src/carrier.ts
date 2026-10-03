/**
 * The plain-Markdown carrier (Core §3, §9; ADR 0003).
 *
 * `plainCarrier` produces the `DocumentInput` shape from nothing but the
 * text: the frontmatter between the `---` fences at the top of the file, and
 * the ATX headings that lie outside fenced code blocks. The Markset adapter
 * produces the same shape from the Markset AST; a test holds the two equal.
 * This carrier emits no syntax diagnostics: plain Markdown has no grammar to
 * fail, and an unclosed fence or missing frontmatter is reported by
 * `readArtifact` as CORE001.
 */
import type { DocumentInput, Heading } from "./types.ts";

/** Core §3 and §9: the plain-Markdown fallback carrier. */
export function plainCarrier(path: string, source: string): DocumentInput {
  const text = source.startsWith("﻿") ? source.slice(1) : source;
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  const frontmatter = findFrontmatter(lines);
  const bodyStart = frontmatter === null ? 0 : frontmatter.close + 1;
  return {
    path,
    source,
    frontmatter: frontmatter === null ? null : { text: frontmatter.text, line: 2 },
    headings: collectHeadings(lines, bodyStart),
    syntax: [],
  };
}

/** Core §3: the 0-based index of the closing frontmatter fence of a document that starts with one, or -1. */
export function closingFenceIndex(lines: readonly string[]): number {
  if (lines.length === 0 || lines[0].trimEnd() !== "---") return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === "---") return i;
  }
  return -1;
}

function findFrontmatter(lines: string[]): { text: string; close: number } | null {
  const close = closingFenceIndex(lines);
  if (close === -1) return null;
  return { text: lines.slice(1, close).join("\n"), close };
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

/** Core §6 and ADR 0003: ATX headings outside fenced code blocks, with inline markup removed. */
export function collectHeadings(lines: readonly string[], from: number): Heading[] {
  const headings: Heading[] = [];
  let fence: { char: string; length: number } | null = null;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i];
    if (fence !== null) {
      const close = new RegExp(`^ {0,3}\\${fence.char}{${fence.length},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open !== null && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { char: open[1][0], length: open[1].length };
      continue;
    }
    const atx = ATX.exec(line);
    if (atx === null) continue;
    headings.push({ depth: atx[1].length, text: headingText(atx[2] ?? ""), line: i + 1 });
  }
  return headings;
}

/** Core §6 and ADR 0003: the plain text of a heading, closing `#`s, emphasis, code spans and link brackets removed. */
export function headingText(raw: string): string {
  let text = raw.trim();
  if (/^#+$/.test(text)) return "";
  text = text.replace(/[ \t]+#+$/, "");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]*)\]/g, "$1");
  text = text.replace(/[*`]/g, "");
  text = text.replace(/(^|\s)_+|_+(?=\s|$)/g, "$1");
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
  return text.replace(/\s+/g, " ").trim();
}
