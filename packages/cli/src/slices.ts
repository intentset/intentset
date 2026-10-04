/**
 * Slices, the code they claim and the records that describe them, for
 * `review`'s list of slices whose code changed while their records did not
 * (Core §10) and for `context <path>`.
 *
 * A slice's code is what its `source`, `backend` and `contract` claims match;
 * its `verification` and `documentation` claims are checks and prose, not
 * implementation. The records that describe a slice are the slice itself, the
 * behaviors it implements, the rules that govern them, the scenarios that
 * illustrate them, the verifications of any of those, the contracts it
 * exposes, and the decisions that inform the slice, its behaviors or its
 * contracts. Knowledge is left out: it explains the model to an audience, and
 * review pins already mark it for review when the model changes.
 */
import { type Artifact, compareStrings, type Graph } from "@intentset/core";
import { matchGlob } from "./glob.ts";

const CODE_CLAIMS = new Set(["source", "backend", "contract"]);

/** Every slice that is not retired and has slice metadata, sorted by ID. */
export function activeSlices(graph: Graph): Artifact[] {
  return [...graph.artifacts.values()]
    .filter((a) => a.meta.type === "slice" && a.meta.status !== "retired" && a.meta.slice !== undefined)
    .sort((a, b) => compareStrings(a.meta.id, b.meta.id));
}

/** The slices with any claim matching `path`, sorted by ID. */
export function claimingSlices(graph: Graph, path: string): Artifact[] {
  return activeSlices(graph).filter((slice) => slice.meta.slice?.claims.some((claim) => matchGlob(claim.path, path)));
}

/** True when one of the slice's source, backend or contract claims matches `path`. */
export function isSliceCode(slice: Artifact, path: string): boolean {
  return slice.meta.slice?.claims.some((claim) => CODE_CLAIMS.has(claim.kind) && matchGlob(claim.path, path)) ?? false;
}

/** The IDs of the records that describe a slice, the slice included, sorted. Only IDs present in the graph. */
export function describingRecords(graph: Graph, slice: Artifact): string[] {
  const out = new Set<string>([slice.meta.id]);
  const targets = (id: string, kind: string) =>
    (graph.out.get(id) ?? []).filter((edge) => edge.kind === kind).map((edge) => edge.to);
  const sources = (id: string, kind: string) =>
    (graph.in.get(id) ?? []).filter((edge) => edge.kind === kind).map((edge) => edge.from);

  const behaviors = targets(slice.meta.id, "implements");
  const rules = behaviors.flatMap((id) => targets(id, "governedBy"));
  const scenarios = behaviors.flatMap((id) => sources(id, "illustrates"));
  const claims = [...behaviors, ...rules, ...scenarios];
  const verifications = claims.flatMap((id) => sources(id, "verifies"));
  const contracts = targets(slice.meta.id, "exposes");
  const decisions = [slice.meta.id, ...behaviors, ...contracts].flatMap((id) => targets(id, "informedBy"));
  for (const id of [...claims, ...verifications, ...contracts, ...decisions]) out.add(id);
  return [...out].filter((id) => graph.artifacts.has(id)).sort(compareStrings);
}
