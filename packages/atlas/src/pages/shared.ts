/**
 * Cells more than one page writes the same way: a verification's evidence
 * status, its latest run, and a knowledge artifact's review status. Each
 * status is a word, with a badge tone that repeats it and never replaces it.
 */
import { type ArtifactMeta, DELIVERY_TYPES, deliveryOf } from "@intentset/core";
import type { ReviewStatus } from "@intentset/publisher";
import { type Model, STATUS_WORDS } from "../model.ts";
import type { Tone } from "../text.ts";
import { badge, code, series, text } from "../text.ts";

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
  if (review.unknownHash !== null)
    reasons.push(`pins of a kind this version does not read: ${code(review.unknownHash)}`);
  else if (review.changed.length > 0) reasons.push(`changed since review: ${review.changed.map(code).join(", ")}`);
  if (review.missing.length > 0) reasons.push(`not pinned: ${review.missing.map(code).join(", ")}`);
  if (review.reviewer === null) reasons.push("no reviewer");
  if (review.reviewedAt === null) reasons.push("no review date");
  if (review.self === "changed") reasons.push("own text changed since review");
  // ADR 0027: knowledge whose sources changed what they promise, and nothing else, can be kept under review.
  if (review.keepable) reasons.push("can be published under review (keepUnderReview)");
  return `${badge("needs review", "warn")} ${reasons.join("; ")}`;
}

/**
 * Whether a record's work exists (Core §7, ADR 0017), in words beside its status, never in place of it: `built`,
 * `planned`, or `not stated`; null for a type that does not carry delivery. `derived` says when the word comes from
 * the record being deprecated (ADR 0023: a deprecated record describes something that existed) rather than from its
 * own `delivery`.
 */
export function deliveryWord(meta: ArtifactMeta): { word: string; derived: boolean } | null {
  if (!(DELIVERY_TYPES as readonly string[]).includes(meta.type)) return null;
  const effective = deliveryOf(meta);
  return { word: effective ?? "not stated", derived: meta.delivery === undefined && effective !== null };
}

/** A claim's evidence in words: verified or not and why, or "not assessed" without evidence. */
export function claimEvidence(model: Model, claim: string): string {
  if (!model.hasEvidence) return `${badge("not assessed", "neutral")} no run evidence supplied`;
  const coverage = model.coverageOf(claim);
  if (coverage === null) return `${badge("not assessed", "neutral")} not in the coverage report`;
  if (coverage.verifications.length === 0) return badge("not verified", "warn");
  const statuses = series(coverage.verifications.map((v) => `${code(v.id)} ${STATUS_WORDS[v.status].word}`));
  return coverage.verified
    ? `${badge("verified", "success")} ${statuses}`
    : `${badge("not verified", "warn")} ${statuses}`;
}

/**
 * Where a claim stands, as one word: `verified` (every applicable definition has a current pass), `failing` (one
 * failed or errored at this snapshot), `stale` (runs exist but none at this snapshot, or one was skipped), `missing`
 * (a definition names it and no run is recorded), `not linked` (no definition names it), or `not assessed` (no run
 * evidence was supplied, so nothing is claimed either way). Only `verified` is ever green.
 */
export type ClaimState = "verified" | "failing" | "stale" | "missing" | "not linked" | "not assessed";

export const CLAIM_STATE_TONES: Readonly<Record<ClaimState, Tone>> = {
  verified: "success",
  failing: "danger",
  stale: "warn",
  missing: "warn",
  "not linked": "warn",
  "not assessed": "neutral",
};

export function claimState(model: Model, claim: string): ClaimState {
  if (!model.linked(claim)) return "not linked";
  if (!model.hasEvidence) return "not assessed";
  const coverage = model.coverageOf(claim);
  if (coverage === null) return "not assessed";
  if (coverage.verified) return "verified";
  const statuses = coverage.verifications.map((v) => v.status);
  if (statuses.some((s) => s === "current-fail" || s === "error")) return "failing";
  if (statuses.some((s) => s === "stale" || s === "skip")) return "stale";
  return "missing";
}

/** A claim's state as a badge. */
export function claimBadge(model: Model, claim: string): string {
  const state = claimState(model, claim);
  return badge(state, CLAIM_STATE_TONES[state]);
}

/** A knowledge record's review as one badge: current, or held for review. */
export function reviewBadge(review: ReviewStatus): string {
  return review.status === "current" ? badge("review current", "success") : badge("held for review", "warn");
}
