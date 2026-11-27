/**
 * Reads CHANGELOG.md: the entries it holds, and the summary each one opens with. Shared by `release:prepare`,
 * `release:notes` and the site's Changelog page and feed, so that one reading of the file decides what a release says.
 *
 * From 0.18.0 an entry opens with a summary, one short line per change under the headings of Keep a Changelog
 * (https://keepachangelog.com) with Breaking first, and `### Details` then holds the paragraphs that say what moved.
 * Entries before 0.18.0 have only the detail.
 */

/** The summary's headings, in the order they appear. */
export const SUMMARY_HEADINGS = ["Breaking", "Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"] as const;

/** The heading that ends the summary and opens the paragraphs it summarizes. */
export const DETAILS_HEADING = "Details";

export interface ChangelogEntry {
  /** The text after `## `: "Unreleased" or "0.18.0 — 2026-11-27". */
  heading: string;
  /** "Unreleased" or the version. */
  version: string;
  /** YYYY-MM-DD, null for Unreleased. */
  date: string | null;
  /** Everything under the heading, trimmed, without it. */
  body: string;
  /** The summary: the body above `### Details`, or null when the entry has no `###` heading at all. */
  summary: string | null;
}

const HEADING = /^(Unreleased|(\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?) — (\d{4}-\d{2}-\d{2}))$/u;

/** The body of an entry split at its `### Details` heading: [summary, detail]; no summary heading means [null, body]. */
export function splitEntry(body: string): [string | null, string] {
  const details = new RegExp(`^### ${DETAILS_HEADING}$`, "mu").exec(body);
  if (details) return [body.slice(0, details.index).trim(), body.slice(details.index + details[0].length).trim()];
  return /^### /mu.test(body) ? [body.trim(), ""] : [null, body.trim()];
}

/** Every entry of the changelog, newest first as written. Throws on a `## ` heading that is not a release. */
export function parseChangelog(text: string): ChangelogEntry[] {
  return text
    .split(/^## /mu)
    .slice(1)
    .map((chunk) => {
      const newline = chunk.indexOf("\n");
      const heading = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
      const match = HEADING.exec(heading);
      if (!match) throw new Error(`CHANGELOG.md: "${heading}" is not a release heading`);
      const body = newline === -1 ? "" : chunk.slice(newline + 1).trim();
      return {
        heading,
        version: match[2] ?? "Unreleased",
        date: match[3] ?? null,
        body,
        summary: splitEntry(body)[0],
      };
    });
}

/**
 * What is wrong with an entry's summary, one sentence each; empty when it is as the convention says: nothing but
 * headings from SUMMARY_HEADINGS (Breaking first when present, each once, each with at least one line) and then
 * `### Details`, and no text above the first.
 */
export function summaryProblems(body: string): string[] {
  const headings = [...body.matchAll(/^### (.*)$/gmu)];
  if (headings.length === 0)
    return [`has no summary: open it with ${SUMMARY_HEADINGS.map((h) => `### ${h}`).join(", ")} as they apply`];
  const problems: string[] = [];
  const first = headings[0] as RegExpMatchArray;
  if (body.slice(0, first.index).trim() !== "") problems.push("has text above its first ### heading");
  const allowed: readonly string[] = [...SUMMARY_HEADINGS, DETAILS_HEADING];
  const seen: string[] = [];
  for (const [i, h] of headings.entries()) {
    const name = (h[1] as string).trim();
    if (!allowed.includes(name)) {
      problems.push(`has "### ${name}", which is not one of ${allowed.join(", ")}`);
      continue;
    }
    if (seen.includes(name)) problems.push(`has "### ${name}" twice`);
    seen.push(name);
    if (name === DETAILS_HEADING && i !== headings.length - 1)
      problems.push(`has a ### heading after ### ${DETAILS_HEADING}`);
    const end = headings[i + 1]?.index ?? body.length;
    const section = body.slice((h.index as number) + h[0].length, end);
    if (name !== DETAILS_HEADING && !/^[-*] /mu.test(section)) problems.push(`has "### ${name}" with no line under it`);
  }
  const summarized = seen.filter((n) => n !== DETAILS_HEADING);
  if (summarized.length === 0) problems.push("has no summary heading before ### Details");
  const order = summarized.map((n) => (SUMMARY_HEADINGS as readonly string[]).indexOf(n));
  if (summarized.includes("Breaking") && summarized[0] !== "Breaking")
    problems.push("has ### Breaking after another heading: Breaking comes first");
  else if (order.some((n, i) => i > 0 && n < (order[i - 1] as number)))
    problems.push(`has its headings out of order: ${SUMMARY_HEADINGS.join(", ")}`);
  return problems;
}

/** One version's body, without its `## ` heading. Throws when the changelog has no such entry. */
export function entryBody(text: string, version: string): string {
  const entry = parseChangelog(text).find((e) => e.version === version);
  if (!entry) throw new Error(`CHANGELOG.md has no entry for ${version}`);
  return entry.body;
}
