import type { Outcome, QuestionRecord } from "../functions/ask/store.ts";

/**
 * The questions report (BEH-QUESTIONS-REPORT) and the gaps brief, as pure functions of the stored records, so the
 * tests read fixtures and never AWS. `cli.ts` reads the table and calls these.
 */

/** The fields the report reads. A stored item carries more; an item missing one is read with an empty value. */
export type StoredQuestion = Pick<
  QuestionRecord,
  | "id"
  | "askedAt"
  | "conversationId"
  | "turn"
  | "question"
  | "answer"
  | "outcome"
  | "sources"
  | "contact"
  | "costMicros"
> &
  Partial<Pick<QuestionRecord, "corpusHash" | "model">>;

/**
 * Conversations the maintainers' own checks start, left out unless asked for. A prefix, not a list of ids: each
 * check names its conversations `<prefix><something>`.
 */
export const defaultExcludePrefixes = ["live-test-", "local-check-", "launch-check-", "hang-check-"] as const;

export const outcomes: readonly Outcome[] = ["answered", "uncited", "contact", "refused-by-model", "failed"];

export interface Window {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

export interface Selection {
  records: StoredQuestion[];
  /** Records in the window left out because their conversation id starts with an excluded prefix. */
  excluded: number;
}

/** The window's records, sorted by time then id, without the excluded conversations. */
export function select(
  items: readonly StoredQuestion[],
  window: Window,
  excludePrefixes: readonly string[],
): Selection {
  const inWindow = items.filter((r) => {
    const t = Date.parse(r.askedAt);
    return Number.isFinite(t) && t >= window.from.getTime() && t < window.to.getTime();
  });
  const records = inWindow
    .filter((r) => !excludePrefixes.some((p) => r.conversationId.startsWith(p)))
    .sort((a, b) => (a.askedAt === b.askedAt ? compare(a.id, b.id) : compare(a.askedAt, b.askedAt)));
  return { records, excluded: inWindow.length - records.length };
}

/** Read one DynamoDB item as a stored question, tolerating missing or mistyped fields. */
export function fromItem(item: Record<string, unknown>): StoredQuestion {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const outcome = outcomes.includes(item.outcome as Outcome) ? (item.outcome as Outcome) : "failed";
  return {
    id: str(item.id),
    askedAt: str(item.askedAt),
    conversationId: str(item.conversationId),
    turn: num(item.turn),
    question: str(item.question),
    answer: str(item.answer),
    outcome,
    sources: Array.isArray(item.sources) ? item.sources.filter((s): s is string => typeof s === "string") : [],
    contact: item.contact === true,
    costMicros: num(item.costMicros),
    corpusHash: str(item.corpusHash),
    model: str(item.model),
  };
}

/**
 * MEAS-QUESTIONS-ANSWERED: of the questions the chat answered from the documentation or could not (outcomes
 * `answered` and `uncited`), the share answered with at least one cited source. Contact requests, the model's
 * refusals and failures are left out of both counts: they are not questions the documentation was asked to answer.
 */
export interface Measure {
  answered: number;
  uncited: number;
  /** answered / (answered + uncited), or null when both are 0. */
  share: number | null;
}

export function measure(records: readonly StoredQuestion[]): Measure {
  const answered = records.filter((r) => r.outcome === "answered").length;
  const uncited = records.filter((r) => r.outcome === "uncited").length;
  const total = answered + uncited;
  return { answered, uncited, share: total === 0 ? null : answered / total };
}

export interface Topic {
  /** The cited page's address, or null for the questions that cited none. */
  source: string | null;
  records: StoredQuestion[];
}

/**
 * Questions grouped by the page their answer cited: a question citing two pages is under both. Those citing none
 * (uncited, and contact requests, refusals and failures that cited nothing) are one group, last.
 */
export function topics(records: readonly StoredQuestion[]): Topic[] {
  const bySource = new Map<string, StoredQuestion[]>();
  const none: StoredQuestion[] = [];
  for (const r of records) {
    if (r.sources.length === 0) none.push(r);
    for (const s of new Set(r.sources)) bySource.set(s, [...(bySource.get(s) ?? []), r]);
  }
  const cited = [...bySource]
    .map(([source, rs]) => ({ source, records: rs }))
    .sort((a, b) => b.records.length - a.records.length || compare(a.source, b.source));
  return none.length > 0 ? [...cited, { source: null, records: none }] : cited;
}

/**
 * The questions the documentation did not answer, grouped by their text once case, spacing and closing punctuation
 * are set aside, so the same question asked twice is one group. Largest group first.
 */
export function gaps(records: readonly StoredQuestion[]): StoredQuestion[][] {
  const groups = new Map<string, StoredQuestion[]>();
  for (const r of records.filter((x) => x.outcome === "uncited")) {
    const key = r.question
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[?.!\s]+$/, "");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length || compare(a[0].askedAt, b[0].askedAt));
}

export interface ReportInput {
  window: Window;
  selection: Selection;
  table: string;
  excludePrefixes: readonly string[];
}

/** The questions report, in Markdown. */
export function renderReport({ window, selection, table, excludePrefixes }: ReportInput): string {
  const { records, excluded } = selection;
  const out: string[] = [];
  out.push("# Questions report", "");
  out.push(header(window, table, excludePrefixes, excluded), "");

  out.push("## Totals", "");
  const cost = records.reduce((sum, r) => sum + r.costMicros, 0);
  const conversations = new Set(records.map((r) => r.conversationId)).size;
  out.push(`- Questions: ${records.length}, in ${conversations} conversation${conversations === 1 ? "" : "s"}`);
  for (const o of outcomes) out.push(`- ${o}: ${records.filter((r) => r.outcome === o).length}`);
  out.push(`- Estimated cost: ${dollars(cost)}`, "");

  out.push("## Measure", "");
  out.push(measureLine(measure(records)), "");

  out.push("## Topics", "");
  const ts = topics(records);
  if (ts.length === 0) out.push("No questions in the period.", "");
  for (const t of ts) {
    out.push(`### ${t.source === null ? "No source cited" : page(t.source)} (${t.records.length})`, "");
    for (const r of t.records) out.push(`- ${line(r.question)} (${r.outcome})`);
    out.push("");
  }

  out.push("## Not answered by the documentation", "");
  const uncited = records.filter((r) => r.outcome === "uncited");
  if (uncited.length === 0) out.push("None.", "");
  else {
    out.push("Every uncited question, with the first line of its answer. Some will be off-topic.", "");
    for (const r of uncited) out.push(...entry(r));
    out.push("");
  }

  out.push("## Contact requests", "");
  const contact = records.filter((r) => r.outcome === "contact");
  if (contact.length === 0) out.push("None.", "");
  else {
    for (const r of contact) out.push(...entry(r));
    out.push("");
  }

  out.push("## Failures and refusals", "");
  const failed = records.filter((r) => r.outcome === "failed" || r.outcome === "refused-by-model");
  if (failed.length === 0) out.push("None.", "");
  else {
    for (const r of failed) out.push(`- ${r.askedAt} ${r.outcome}: ${line(r.question)}`);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/**
 * The gaps brief: the questions the documentation did not answer, grouped, and what an agent does with them. It names
 * no model and runs none; the agent is whoever is given it.
 */
export function renderGaps({ window, selection, table, excludePrefixes }: ReportInput): string {
  const groups = gaps(selection.records);
  const out: string[] = [];
  out.push("# Documentation gaps: a brief for drafting knowledge", "");
  out.push(header(window, table, excludePrefixes, selection.excluded), "");
  out.push(measureLine(measure(selection.records)), "");
  out.push("## What to do", "");
  out.push(
    "These are questions visitors asked the chat on intentset.org that its answer cited no page for. For each group:",
    "",
    "1. Set aside a question that is not about Intentset, its specifications or its tools, and say so in your summary.",
    "2. Look for the answer in what is published: `spec/`, `site/content/`, and the records under `product/model/`. " +
      "If a page already answers it, the gap is in finding it: name the page and suggest a change to it instead.",
    "3. Otherwise draft one knowledge record per subject under `product/model/knowledge/KB-<SUBJECT>.md`: " +
      "`type: knowledge`, `status: draft`, `owner: maintainers`, `visibility: public`, `audiences` from " +
      "`.intentset/registries.yaml`, `links.explains` naming the capabilities, behaviors or rules it explains, a " +
      "`## Guidance` section, and a `## Sources` section naming every file and section it draws on.",
    "4. Write only what those sources say. Never invent a fact, a command, an option or a date; where the sources are " +
      "silent, write the open question for a maintainer instead of an answer.",
    "5. Describe the subject in your own words. Never copy a visitor's question into the repository: it is public, " +
      "and the questions are visitor data kept for 90 days.",
    "6. Leave every record a draft. A person reviews it, and publication refuses a draft (publication §1).",
    "7. Run `pnpm run model:validate` and `pnpm run model:review`, and open a pull request for a maintainer.",
    "",
  );
  out.push("## Unanswered questions", "");
  if (groups.length === 0) out.push("None in the period.", "");
  groups.forEach((group, i) => {
    const first = group[0];
    out.push(`### ${i + 1}. Asked ${group.length} time${group.length === 1 ? "" : "s"}`, "");
    out.push(`- Question: ${line(first.question)}`);
    out.push(`- Answer's first line: ${line(firstLine(first.answer))}`);
    out.push(`- First asked: ${first.askedAt}${first.corpusHash ? `, corpus ${first.corpusHash.slice(0, 12)}` : ""}`);
    out.push("");
  });
  return `${out.join("\n").trimEnd()}\n`;
}

function header(window: Window, table: string, excludePrefixes: readonly string[], excluded: number): string {
  const prefixes = excludePrefixes.length === 0 ? "none" : excludePrefixes.map((p) => `\`${p}\``).join(", ");
  return [
    `Period: ${window.from.toISOString()} to ${window.to.toISOString()}, from \`${table}\`.`,
    `Excluded conversation prefixes: ${prefixes} (${excluded} question${excluded === 1 ? "" : "s"} left out).`,
    "Visitor data: keep this out of the repository.",
  ].join("\n");
}

export function measureLine(m: Measure): string {
  return m.share === null
    ? "MEAS-QUESTIONS-ANSWERED: no answered or uncited questions in the period."
    : `MEAS-QUESTIONS-ANSWERED: ${(m.share * 100).toFixed(1)}% answered with a cited source (${m.answered} of ${m.answered + m.uncited}; ${m.uncited} uncited).`;
}

function entry(r: StoredQuestion): string[] {
  return [`- ${r.askedAt}: ${line(r.question)}`, `  - Answer: ${line(firstLine(r.answer))}`];
}

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? ""
  );
}

/** One line, at most 200 characters, so a question can never break the report's structure. */
function line(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return "(empty)";
  return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat;
}

function page(url: string): string {
  return url.replace(/^https:\/\/intentset\.org/, "") || "/";
}

function dollars(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
