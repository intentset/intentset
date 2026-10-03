/**
 * Needs-review (Core §9): knowledge is current only while every source it was
 * reviewed against still has the hash it had at review.
 *
 * A review is `reviewedBy` and `reviewedAt` in the knowledge's own
 * frontmatter plus a review record under
 * `intentset.extensions["intentset.org/review"]` that pins, by ID, the
 * source hash each source had when it was reviewed:
 *
 *     extensions:
 *       intentset.org/review:
 *         sources:
 *           BEH-ASMT-SCHEDULE: 2f53...
 *           RULE-ASMT-FUTURE: e39f...
 *         snapshot: <commit or graph hash at review, informative>
 *
 * The sources a review must pin are what the knowledge `explains`, plus the
 * rules that govern each explained behavior: a rule changing under a behavior
 * changes what the behavior promises, which is catalog case P04.
 *
 * A pin of the literal `@current` is a fixture placeholder: `bindReviewPins`
 * replaces it with the source's hash in the snapshot being checked, so a
 * case can say "reviewed against what is there now" without computing a
 * hash. Unbound, it never equals a hash, so it reads as changed.
 */
import type { Artifact, Graph } from "@intentset/core";
import { compareStrings, sortedUnique } from "./diagnostic.ts";

export const REVIEW_EXTENSION = "intentset.org/review";
export const CURRENT_PIN = "@current";

export interface ReviewRecord {
  /** Source ID -> the source hash it was reviewed against. Entries that are not strings are dropped. */
  sources: Record<string, string>;
  snapshot?: string;
}

export interface ReviewStatus {
  status: "current" | "needs-review";
  /** Sources whose current hash differs from the pin, or that are no longer in the graph. */
  changed: string[];
  /** Sources the review record does not pin. */
  missing: string[];
  /** `reviewedBy`, or null when the knowledge names no reviewer. */
  reviewer: string | null;
  /** `reviewedAt`, or null when absent. */
  reviewedAt: string | null;
}

/** The sources a review must pin: everything explained, and the rules governing each explained behavior. Sorted. */
export function reviewSources(graph: Graph, artifact: Artifact): string[] {
  const ids: string[] = [];
  for (const id of artifact.meta.links.explains ?? []) {
    ids.push(id);
    const source = graph.artifacts.get(id);
    if (source?.meta.type === "behavior") ids.push(...(source.meta.links.governedBy ?? []));
  }
  return sortedUnique(ids);
}

/** The review record of a knowledge artifact, or null when it has none or it is not a mapping with `sources`. */
export function readReviewRecord(artifact: Artifact): ReviewRecord | null {
  const value = artifact.meta.extensions?.[REVIEW_EXTENSION];
  if (!isRecord(value) || !isRecord(value.sources)) return null;
  const sources: Record<string, string> = {};
  for (const id of Object.keys(value.sources).sort(compareStrings)) {
    const pin = value.sources[id];
    if (typeof pin === "string") sources[id] = pin;
  }
  const record: ReviewRecord = { sources };
  if (typeof value.snapshot === "string") record.snapshot = value.snapshot;
  return record;
}

/** Core §9: whether the knowledge is current against the sources it was reviewed against. */
export function reviewStatus(graph: Graph, artifact: Artifact): ReviewStatus {
  const record = readReviewRecord(artifact);
  const changed: string[] = [];
  const missing: string[] = [];
  for (const id of reviewSources(graph, artifact)) {
    const pin = record?.sources[id];
    if (pin === undefined) missing.push(id);
    else if (graph.artifacts.get(id)?.sourceHash !== pin) changed.push(id);
  }
  const reviewer = nonEmpty(artifact.meta.reviewedBy);
  const reviewedAt = nonEmpty(artifact.meta.reviewedAt);
  const current = changed.length === 0 && missing.length === 0 && reviewer !== null && reviewedAt !== null;
  return { status: current ? "current" : "needs-review", changed, missing, reviewer, reviewedAt };
}

/**
 * Bind every `@current` pin to the pinned source's hash in this graph, for
 * fixtures. Returns a new graph; the given one is not modified, and nothing
 * the graph hash covers changes. A pin naming an artifact that is not in the
 * graph stays `@current`, which reads as changed.
 */
export function bindReviewPins(graph: Graph): Graph {
  const artifacts = new Map<string, Artifact>();
  for (const [id, artifact] of graph.artifacts) {
    const value = artifact.meta.extensions?.[REVIEW_EXTENSION];
    if (!isRecord(value) || !isRecord(value.sources) || !Object.values(value.sources).includes(CURRENT_PIN)) {
      artifacts.set(id, artifact);
      continue;
    }
    const sources: Record<string, unknown> = {};
    for (const [source, pin] of Object.entries(value.sources)) {
      sources[source] = pin === CURRENT_PIN ? (graph.artifacts.get(source)?.sourceHash ?? pin) : pin;
    }
    const extensions = { ...artifact.meta.extensions, [REVIEW_EXTENSION]: { ...value, sources } };
    artifacts.set(id, { ...artifact, meta: { ...artifact.meta, extensions } });
  }
  return { ...graph, artifacts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value;
}
