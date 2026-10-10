/**
 * The eval's questions and how an answer is judged against them (SLICE-ASK). Pure: the runner (run.ts) asks the
 * model, and amplify/test/eval.test.ts holds the questions file and these rules without one.
 */
import type { Corpus } from "../functions/ask/corpus.ts";

export interface Expectation {
  /** The outcome the function records, or the acceptable ones. */
  outcome?: string | string[];
  /** Paths on the site, any one of which the answer must cite. */
  sources?: string[];
  /** The answer must cite nothing. */
  noSources?: boolean;
  /** Case-insensitive regular expressions the answer's text must match. */
  includes?: string[];
  /** Case-insensitive regular expressions the answer's text must not match. */
  excludes?: string[];
}

export interface EvalQuestion {
  id: string;
  topic: string;
  question: string;
  expect: Expectation;
}

/** What one question came back with. */
export interface EvalAnswer {
  outcome: string;
  /** The cited documents' addresses, as the corpus gives them. */
  sources: string[];
  text: string;
}

const OUTCOMES = new Set(["answered", "uncited", "contact", "refused-by-model", "failed"]);

/** The questions file, checked: every question has an id, a topic, a question and at least one expectation. */
export function readQuestions(value: unknown): EvalQuestion[] {
  const questions = (value as { questions?: unknown })?.questions;
  if (!Array.isArray(questions) || questions.length === 0) throw new Error("questions.json has no questions");
  const ids = new Set<string>();
  for (const q of questions as EvalQuestion[]) {
    if (typeof q?.id !== "string" || typeof q.topic !== "string" || typeof q.question !== "string") {
      throw new Error(`a question lacks an id, a topic or its text: ${JSON.stringify(q)}`);
    }
    if (ids.has(q.id)) throw new Error(`${q.id}: the id is used twice`);
    ids.add(q.id);
    const e = q.expect ?? {};
    if (e.outcome === undefined && e.sources === undefined && e.noSources === undefined) {
      throw new Error(`${q.id}: expects neither an outcome nor sources`);
    }
    for (const outcome of [e.outcome ?? []].flat()) {
      if (!OUTCOMES.has(outcome)) throw new Error(`${q.id}: unknown outcome ${outcome}`);
    }
    if (e.noSources && e.sources) throw new Error(`${q.id}: expects sources and none`);
    for (const pattern of [...(e.includes ?? []), ...(e.excludes ?? [])]) new RegExp(pattern, "i");
  }
  return questions as EvalQuestion[];
}

/** The site's origin, read from the corpus, which every expected path is under. */
export function origin(corpus: Corpus): string {
  return new URL(corpus.documents[0].url).origin;
}

/** Expected paths the corpus has no document at: an eval that names one could never pass. */
export function unknownSources(questions: EvalQuestion[], corpus: Corpus): string[] {
  const urls = new Set(corpus.documents.map((doc) => doc.url));
  const base = origin(corpus);
  return questions.flatMap((q) =>
    (q.expect.sources ?? []).filter((path) => !urls.has(base + path)).map((path) => `${q.id}: ${path}`),
  );
}

/** Why the answer does not meet the question's expectations; empty when it does. */
export function judge(question: EvalQuestion, answer: EvalAnswer, base: string): string[] {
  const e = question.expect;
  const problems: string[] = [];
  const outcomes = [e.outcome ?? []].flat();
  if (outcomes.length > 0 && !outcomes.includes(answer.outcome)) {
    problems.push(`outcome ${answer.outcome}, expected ${outcomes.join(" or ")}`);
  }
  if (e.sources && !e.sources.some((path) => answer.sources.includes(base + path))) {
    problems.push(`cited none of ${e.sources.join(", ")}`);
  }
  if (e.noSources && answer.sources.length > 0) problems.push("cited a source, expected none");
  for (const pattern of e.includes ?? []) {
    if (!new RegExp(pattern, "im").test(answer.text)) problems.push(`does not say /${pattern}/`);
  }
  for (const pattern of e.excludes ?? []) {
    if (new RegExp(pattern, "im").test(answer.text)) problems.push(`says /${pattern}/`);
  }
  return problems;
}
