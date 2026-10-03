/**
 * What the pages read from the graph and the reports, computed once. Link
 * facts come from the graph alone and are always available; evidence facts
 * come only from a supplied coverage report, and are null when there is none,
 * so no page can show a pass that nobody recorded (invariant 3).
 */
import { type Artifact, type ArtifactType, compareStrings, type Graph, type LinkKind, LEVELS } from "@intentset/core";
import type { AtlasInput, ClaimCoverage, EvidenceStatus, VerificationEvidence } from "./types.ts";
import type { Tone } from "./text.ts";

export const CLAIM_TYPES: readonly ArtifactType[] = ["behavior", "rule", "scenario"];

/** Every evidence status as the word a reader sees, and the tone that repeats it. */
export const STATUS_WORDS: Readonly<Record<EvidenceStatus, { word: string; tone: Tone; meaning: string }>> = {
  "current-pass": {
    word: "current pass",
    tone: "success",
    meaning: "the latest run at this snapshot passed",
  },
  "current-fail": {
    word: "failing",
    tone: "danger",
    meaning: "the latest run at this snapshot failed; an earlier pass does not hide it",
  },
  stale: {
    word: "stale",
    tone: "warn",
    meaning: "runs exist, none at this commit and graph hash; a stale pass is not a pass",
  },
  skip: { word: "skipped", tone: "warn", meaning: "the latest run at this snapshot was skipped, which is not a pass" },
  error: { word: "error", tone: "danger", meaning: "the latest run at this snapshot could not complete" },
  missing: { word: "missing", tone: "warn", meaning: "no run has been recorded for this definition" },
  unresolved: {
    word: "unresolved",
    tone: "neutral",
    meaning: "the evidence could not be classified, so nothing is claimed either way",
  },
};

export const STATUS_ORDER: readonly EvidenceStatus[] = [
  "current-pass",
  "current-fail",
  "stale",
  "skip",
  "error",
  "missing",
  "unresolved",
];

export class Model {
  readonly input: AtlasInput;
  readonly graph: Graph;
  readonly #byType = new Map<ArtifactType, Artifact[]>();
  readonly #perClaim = new Map<string, ClaimCoverage>();

  constructor(input: AtlasInput) {
    this.input = input;
    this.graph = input.graph;
    for (const id of [...this.graph.artifacts.keys()].sort(compareStrings)) {
      const artifact = this.graph.artifacts.get(id) as Artifact;
      const list = this.#byType.get(artifact.meta.type);
      if (list === undefined) this.#byType.set(artifact.meta.type, [artifact]);
      else list.push(artifact);
    }
    for (const claim of input.evidence?.coverage.perClaim ?? []) this.#perClaim.set(claim.id, claim);
  }

  /** Artifacts of a type, sorted by ID. */
  ofType(type: ArtifactType): Artifact[] {
    return this.#byType.get(type) ?? [];
  }

  get(id: string): Artifact | undefined {
    return this.graph.artifacts.get(id);
  }

  get hasEvidence(): boolean {
    return this.input.evidence !== undefined && this.input.evidence !== null;
  }

  /** Sources of authored edges of one kind arriving at `id`, in the graph and of the given type, sorted and unique. */
  into(id: string, kind: LinkKind, type?: ArtifactType): string[] {
    return this.#typed(
      (this.graph.in.get(id) ?? []).filter((e) => e.kind === kind).map((e) => e.from),
      type,
    );
  }

  /** Targets of authored edges of one kind leaving `id`, in the graph and of the given type, sorted and unique. */
  from(id: string, kind: LinkKind, type?: ArtifactType): string[] {
    return this.#typed(
      (this.graph.out.get(id) ?? []).filter((e) => e.kind === kind).map((e) => e.to),
      type,
    );
  }

  #typed(ids: string[], type: ArtifactType | undefined): string[] {
    const kept = ids.filter((id) => {
      const artifact = this.graph.artifacts.get(id);
      return artifact !== undefined && (type === undefined || artifact.meta.type === type);
    });
    return [...new Set(kept)].sort(compareStrings);
  }

  /** The slices that implement a behavior, through the derived side of `implements`. */
  owners(behavior: string): string[] {
    return this.into(behavior, "implements", "slice");
  }

  /** The navigation chain from the root down to the artifact's parent, stopping at a cycle or a missing ID. */
  ancestry(id: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>([id]);
    let cursor = this.get(id)?.meta.parent;
    while (cursor !== undefined && !visited.has(cursor) && this.graph.artifacts.has(cursor)) {
      visited.add(cursor);
      chain.push(cursor);
      cursor = this.get(cursor)?.meta.parent;
    }
    return chain.reverse();
  }

  /** A behavior's claims: itself, its rules and its scenarios, retired ones left out as coverage leaves them out. */
  claimsOf(behavior: string): string[] {
    const ids = [
      behavior,
      ...this.from(behavior, "governedBy", "rule"),
      ...this.into(behavior, "illustrates", "scenario"),
    ];
    return [...new Set(ids)].filter((id) => this.get(id)?.meta.status !== "retired");
  }

  /** Applicable verifications naming a claim in `verifies`: retired ones are not applicable (as in coverage). */
  verificationsOf(claim: string): string[] {
    return this.into(claim, "verifies", "verification").filter((id) => this.get(id)?.meta.status !== "retired");
  }

  /** Link coverage, from the graph: at least one applicable verification names the claim. */
  linked(claim: string): boolean {
    return this.verificationsOf(claim).length > 0;
  }

  /** The coverage report's entry for a claim; null when no evidence was supplied or the claim is not in it. */
  coverageOf(claim: string): ClaimCoverage | null {
    return this.#perClaim.get(claim) ?? null;
  }

  /** The classification of a verification; null when no evidence was supplied or it is not in it. */
  evidenceOf(verification: string): VerificationEvidence | null {
    return this.input.evidence?.classification.verifications[verification] ?? null;
  }

  /** Whether the level asks for evidence of a claim with this status (Core §11 L3, and not a draft). */
  evidenceRequired(status: string): boolean {
    return LEVELS.indexOf(this.input.snapshot.level) >= LEVELS.indexOf("L3") && status !== "draft";
  }
}
