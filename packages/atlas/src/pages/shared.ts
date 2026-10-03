/**
 * Cells more than one page writes the same way: a verification's evidence
 * status, its latest run, and a knowledge artifact's review status. Each
 * status is a word, with a badge tone that repeats it and never replaces it.
 */
import type { ReviewStatus } from "@intentset/publisher";
import { type Model, STATUS_WORDS } from "../model.ts";
import { badge, code, text } from "../text.ts";

/** A verification's evidence status, or "not assessed" when no evidence was supplied. */
export function evidenceCell(model: Model, verification: string): string {
  if (!model.hasEvidence) return `${badge("not assessed", "neutral")} no run evidence supplied`;
  const evidence = model.evidenceOf(verification);
  if (evidence === null) return `${badge("unresolved", "neutral")} not in the classification`;
  const { word, tone } = STATUS_WORDS[evidence.status];
  return evidence.note === undefined ? badge(word, tone) : `${badge(word, tone)} ${text(evidence.note)}`;
}

/** The run that decided the status, in words, saying whether it was made at this snapshot. */
export function latestRun(model: Model, verification: string): string {
  if (!model.hasEvidence) return "no run evidence supplied";
  const latest = model.evidenceOf(verification)?.latest ?? null;
  if (latest === null) return "no run recorded";
  const snapshot = model.input.evidence?.classification.snapshot;
  const here =
    snapshot !== undefined &&
    latest.graphHash === snapshot.graphHash &&
    (snapshot.commit === null || latest.commit === snapshot.commit);
  return (
    `${code(latest.evidenceId)} ${latest.result}, finished ${text(latest.finishedAt)}, ` +
    (here
      ? "at this snapshot"
      : `at commit ${text(latest.commit.slice(0, 12))}, graph hash ${text(latest.graphHash.slice(0, 12))}`)
  );
}

/** A knowledge artifact's review status in words: current, or what makes it need review. */
export function reviewCell(review: ReviewStatus): string {
  if (review.status === "current")
    return `${badge("review current", "success")} reviewed by ${text(review.reviewer ?? "")}`;
  const reasons: string[] = [];
  if (review.changed.length > 0) reasons.push(`changed since review: ${review.changed.map(code).join(", ")}`);
  if (review.missing.length > 0) reasons.push(`not pinned: ${review.missing.map(code).join(", ")}`);
  if (review.reviewer === null) reasons.push("no reviewer");
  if (review.reviewedAt === null) reasons.push("no review date");
  return `${badge("needs review", "warn")} ${reasons.join("; ")}`;
}
