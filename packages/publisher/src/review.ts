/**
 * Needs-review (Core §9): knowledge is current only while every source it was
 * reviewed against still has the hash it had at review.
 *
 * A review is `reviewedBy` and `reviewedAt` in the knowledge's own
 * frontmatter plus `review`, a core field since 0.3 (ADR 0025), that pins, by
 * ID, the hash each source had when it was reviewed:
 *
 *     review:
 *       sources:
 *         BEH-ASMT-SCHEDULE: 2f53...
 *         RULE-ASMT-FUTURE: e39f...
 *       hash: content-v1      # optional; absent means content-v1
 *       snapshot: <commit or graph hash at review, informative>
 *
 * The sources a review must pin are what the knowledge `explains`, plus the
 * rules that govern each explained behavior: a rule changing under a behavior
 * changes what the behavior promises, which is catalog case P04.
 *
 * A pin is one of two kinds, named by the review's `hash` (publication §3,
 * ADR 0018, ADR 0025). Without `hash`, or with `hash: content-v1`, a pin is
 * the source's `contentHash`, which leaves out the lifecycle and review
 * fields, so approving or implementing a source, or marking its delivery,
 * leaves the knowledge current. With `hash: file-v1`, it is the source's
 * `sourceHash`, the bytes of the whole file, which every review made before
 * 0.13.0 holds and `intentset migrate --to 0.3` names. Any other `hash` is a
 * kind this version does not know: every pin reads as changed.
 *
 * A pin of the literal `@current` is a fixture placeholder: `bindReviewPins`
 * replaces it with the source's hash of the record's kind in the snapshot
 * being checked, so a case can say "reviewed against what is there now"
 * without computing a hash. Unbound, it never equals a hash, so it reads as
 * changed.
 */
import { type Artifact, type Graph, graphHash, type KnowledgeReportSection, type ReviewMeta } from "@intentset/core";
import { compareStrings, sortedUnique } from "./diagnostic.ts";

export const CURRENT_PIN = "@current";
/** The pin kinds a review can name in `hash` (publication §3). Absent means `content-v1` (ADR 0025). */
export const PIN_KINDS = ["content-v1", "file-v1"] as const;
export type PinKind = (typeof PIN_KINDS)[number];
/** The kind a review pins when it names none (publication §3, ADR 0025). */
export const DEFAULT_PIN_KIND: PinKind = "content-v1";

/** A knowledge record's review as core reads it (Core §9): its pins, its `hash` and its `snapshot`. */
export type ReviewRecord = ReviewMeta;

export interface ReviewStatus {
  status: "current" | "needs-review";
  /** Sources whose current hash differs from the pin, or that are no longer in the graph. */
  changed: string[];
  /** Sources the review record does not pin. */
  missing: string[];
  /** The record's `hash` when this version does not know it, so no pin can match; null otherwise. */
  unknownHash: string | null;
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

/** The review of a knowledge artifact, or null when it has none (core reads its shape, CORE001). */
export function readReviewRecord(artifact: Artifact): ReviewRecord | null {
  return artifact.meta.review ?? null;
}

/** Core §9: whether the knowledge is current against the sources it was reviewed against. */
export function reviewStatus(graph: Graph, artifact: Artifact): ReviewStatus {
  const record = readReviewRecord(artifact);
  const hashOf = pinHash(record?.hash);
  const unknownHash = record?.hash !== undefined && hashOf === null ? record.hash : null;
  const changed: string[] = [];
  const missing: string[] = [];
  for (const id of reviewSources(graph, artifact)) {
    const pin = record?.sources[id];
    const source = graph.artifacts.get(id);
    if (pin === undefined) missing.push(id);
    else if (source === undefined || hashOf === null || hashOf(source) !== pin) changed.push(id);
  }
  const reviewer = nonEmpty(artifact.meta.reviewedBy);
  const reviewedAt = nonEmpty(artifact.meta.reviewedAt);
  const current = changed.length === 0 && missing.length === 0 && reviewer !== null && reviewedAt !== null;
  return { status: current ? "current" : "needs-review", changed, missing, unknownHash, reviewer, reviewedAt };
}

/**
 * The hash a pin of this kind holds for a source, or null for a kind this version does not know. Absent is
 * `content-v1` (ADR 0025).
 */
export function pinHash(kind: string | undefined): ((source: Artifact) => string) | null {
  if (kind === undefined || kind === "content-v1") return (source) => source.contentHash;
  if (kind === "file-v1") return (source) => source.sourceHash;
  return null;
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
    const review = artifact.meta.review;
    if (review === undefined || !Object.values(review.sources).includes(CURRENT_PIN)) {
      artifacts.set(id, artifact);
      continue;
    }
    const hashOf = pinHash(review.hash);
    const sources: Record<string, string> = {};
    for (const [source, pin] of Object.entries(review.sources)) {
      const found = graph.artifacts.get(source);
      sources[source] = pin === CURRENT_PIN && found !== undefined && hashOf !== null ? hashOf(found) : pin;
    }
    artifacts.set(id, { ...artifact, meta: { ...artifact.meta, review: { ...review, sources } } });
  }
  return { ...graph, artifacts };
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value;
}

/**
 * `reports.knowledge` for the export (spec/export.md §4.2): the review status
 * of every knowledge artifact in the graph, sorted by ID. Computed over the
 * whole graph, so a withheld source that changed still makes its knowledge
 * needs-review; the export removes the withheld IDs from the lists.
 */
export function knowledgeReport(graph: Graph): KnowledgeReportSection {
  const ids = [...graph.artifacts.keys()].filter((id) => graph.artifacts.get(id)?.meta.type === "knowledge");
  return {
    graphHash: graphHash(graph),
    artifacts: ids.sort(compareStrings).map((id) => {
      const artifact = graph.artifacts.get(id) as Artifact;
      const status = reviewStatus(graph, artifact);
      return {
        id,
        lifecycle: artifact.meta.status,
        status: status.status,
        reviewer: status.reviewer,
        reviewedAt: status.reviewedAt,
        sources: reviewSources(graph, artifact),
        changed: [...status.changed].sort(compareStrings),
        missing: [...status.missing].sort(compareStrings),
        withheld: 0,
      };
    }),
  };
}
