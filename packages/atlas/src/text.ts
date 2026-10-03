/**
 * Writing Markset source safely. Every value that comes from a record (a
 * title, a path, a message) goes through one of these before it is placed in
 * a page, so no record can open a directive, a link, a span or a table cell
 * of its own. The Atlas is generated as Markset text and parsed back, the way
 * Markset's own site generates its listings, and a page that does not parse
 * cleanly is a bug in this file rather than something a record can cause.
 */

/** Characters that can start inline or block syntax anywhere in a line. All are ASCII punctuation, so `\` escapes them. */
const SPECIAL = /[\\`*_[\]{}<>!&|~:#+$]/g;

/** Inline text: special characters escaped, line breaks folded, and a leading marker made literal. */
export function text(value: string): string {
  const escaped = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(SPECIAL, (c) => `\\${c}`);
  if (/^[-=]/.test(escaped)) return `\\${escaped}`;
  return escaped.replace(/^(\d+)([.)])/, "$1\\$2");
}

/** A code span holding `value` verbatim: a backtick run longer than any inside, and `|` escaped for table cells. */
export function code(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  const longest = Math.max(0, ...[...flat.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat.replace(/\|/g, "\\|")}${pad}${fence}`;
}

/** A link whose label is already Markset (for example a code span) and whose target is a relative path built here. */
export function link(label: string, href: string): string {
  return `[${label}](${href})`;
}

/** An ID in a code span, linked when there is somewhere to link it to. */
export function idLink(id: string, href: string | null): string {
  return href === null ? code(id) : link(code(id), href);
}

export type Tone = "neutral" | "info" | "success" | "warn" | "danger";

/** A status word as a badge. The word is the information; the tone only repeats it, so nothing is said by color alone. */
export function badge(word: string, tone: Tone): string {
  return `[${text(word)}]{.badge .${tone}}`;
}

/** "1 behavior", "2 behaviors". */
export function plural(n: number, noun: string, nouns = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : nouns}`;
}

/** "a of b nouns": a count that always carries its denominator. */
export function ofTotal(n: number, total: number, noun: string, nouns = `${noun}s`): string {
  return `${n} of ${total} ${total === 1 ? noun : nouns}`;
}

/** "a, b and c". */
export function series(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** A GFM table from a header and rows of cells already written as Markset. */
export function table(header: readonly string[], rows: readonly (readonly string[])[]): string[] {
  const line = (cells: readonly string[]) => `| ${cells.map((c) => (c === "" ? " " : c)).join(" | ")} |`;
  return [line(header), `|${header.map(() => "---").join("|")}|`, ...rows.map(line)];
}

/** Verbatim text in a tilde fence longer than any tilde run inside it, so nothing in it can close the fence. */
export function fenced(body: string, info = ""): string[] {
  const content = body.replace(/^\s*\n/, "").trimEnd();
  const longest = Math.max(0, ...[...content.matchAll(/~+/g)].map((m) => m[0].length));
  const fence = "~".repeat(Math.max(4, longest + 1));
  return [`${fence}${info}`, ...(content === "" ? [] : content.split("\n")), fence];
}

/** Text for an HTML attribute or element, for the shell around the rendered Markset. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
