/**
 * Slices, the code they claim and the records that describe them (Core §10),
 * the definitions `review`'s drift list, `context <path>` and `select`'s
 * `describing` and `claims` fields share. They moved here from the CLI in
 * 0.11.0 (ADR 0016), so a consumer calls Intentset's definition rather than
 * copying it.
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
import { matchGlob } from "./glob.ts";
import { compareStrings } from "./report.ts";
import {
  type ArtifactType,
  type Artifact,
  type Claim,
  type Graph,
  LINK_ENDPOINTS,
  type LinkKind,
  PARENT_TARGETS,
} from "./types.ts";

const CODE_CLAIMS = new Set(["source", "backend", "contract"]);

/** Every slice that is not retired and has slice metadata, sorted by ID. */
export function activeSlices(graph: Graph): Artifact[] {
  return [...graph.artifacts.values()]
    .filter((a) => a.meta.type === "slice" && a.meta.status !== "retired" && a.meta.slice !== undefined)
    .sort((a, b) => compareStrings(a.meta.id, b.meta.id));
}

/** The slices with any claim matching `path`, sorted by ID. */
export function claimingSlices(graph: Graph, path: string): Artifact[] {
  return activeSlices(graph).filter((slice) => claimsPath(slice.meta.slice?.claims ?? [], path));
}

/** True when any of `claims` matches the repository-relative `path` (VSA §3). */
export function claimsPath(claims: readonly Claim[], path: string): boolean {
  return claims.some((claim) => matchGlob(claim.path, path));
}

/** True when one of the slice's source, backend or contract claims matches `path`. */
export function isSliceCode(slice: Artifact, path: string): boolean {
  return slice.meta.slice?.claims.some((claim) => CODE_CLAIMS.has(claim.kind) && matchGlob(claim.path, path)) ?? false;
}

/** The IDs of the records that describe a slice, the slice included, sorted. Only IDs present in the graph. */
export function describingRecords(graph: Graph, slice: Artifact): string[] {
  return [...describing(graphIndex(graph), slice.meta.id, false).ids].sort(compareStrings);
}

/**
 * What the describing traversal reads: authored links in each direction among the records it can see, and which of
 * them have link ends it cannot see. A graph hides nothing; an export hides what it withheld (spec/list.md §3).
 */
export interface LinkIndex {
  has(id: string): boolean;
  type(id: string): ArtifactType | undefined;
  /** Visible targets of the authored `kind` links leaving `id`, as authored (an unresolved ID included). */
  targets(id: string, kind: LinkKind): readonly string[];
  /** Visible sources of the authored `kind` links arriving at `id`. */
  sources(id: string, kind: LinkKind): readonly string[];
  /** True when `id` has a link end at a withheld artifact. */
  hidden(id: string): boolean;
  /** Visible records of `type` with a link end at a withheld artifact, sorted. */
  hiddenOfType(type: ArtifactType): readonly string[];
  /** True when the source withheld any artifact. */
  withholds: boolean;
}

/** A graph as a LinkIndex: everything visible, nothing hidden. */
export function graphIndex(graph: Graph): LinkIndex {
  return {
    has: (id) => graph.artifacts.has(id),
    type: (id) => graph.artifacts.get(id)?.meta.type,
    targets: (id, kind) => (graph.out.get(id) ?? []).filter((edge) => edge.kind === kind).map((edge) => edge.to),
    sources: (id, kind) => (graph.in.get(id) ?? []).filter((edge) => edge.kind === kind).map((edge) => edge.from),
    hidden: () => false,
    hiddenOfType: () => [],
    withholds: false,
  };
}

/**
 * True when a record of `type` could have a `kind` link in `direction` at all (Core §5's endpoints), so a withheld
 * end of that record could be one. A rule authors no `governedBy`, so its withheld ends never change that answer.
 */
export function linkPossible(type: ArtifactType, direction: "out" | "in", kind: LinkKind): boolean {
  if (kind === "replacedBy") return true;
  if (kind === "parent") {
    return direction === "out"
      ? PARENT_TARGETS[type] !== undefined
      : Object.values(PARENT_TARGETS).some((targets) => targets?.includes(type));
  }
  const ends = LINK_ENDPOINTS[kind];
  return (direction === "out" ? ends.from : ends.to).includes(type);
}

/** A set of reached records, and whether a withheld record may also have been reached. */
interface Reach {
  ids: Set<string>;
  wild: boolean;
}

/**
 * The describing traversal from `sliceId` (Core §10). Exact (`loose` false), it reaches what the visible links reach.
 * Loose, it also reaches every record a withheld artifact could have connected: where a reached record has a withheld
 * end of the kind a step follows, the step may reach a withheld record, and from a withheld record every visible
 * record of the step's type that has a withheld end of its own. Loose minus exact is what is undetermined.
 */
export function describing(index: LinkIndex, sliceId: string, loose: boolean): Reach {
  const start: Reach = index.has(sliceId)
    ? { ids: new Set([sliceId]), wild: false }
    : { ids: new Set(), wild: loose && index.withholds };
  const step = (from: Reach, kind: LinkKind, direction: "out" | "in", type: ArtifactType): Reach => {
    const ids = new Set<string>();
    let wild = false;
    for (const id of from.ids) {
      for (const next of direction === "out" ? index.targets(id, kind) : index.sources(id, kind)) ids.add(next);
      const own = index.type(id);
      if (loose && own !== undefined && index.hidden(id) && linkPossible(own, direction, kind)) wild = true;
    }
    if (loose && from.wild) {
      wild = true;
      for (const id of index.hiddenOfType(type)) ids.add(id);
    }
    return { ids, wild };
  };
  const union = (...reaches: Reach[]): Reach => ({
    ids: new Set(reaches.flatMap((reach) => [...reach.ids])),
    wild: reaches.some((reach) => reach.wild),
  });

  const behaviors = step(start, "implements", "out", "behavior");
  const rules = step(behaviors, "governedBy", "out", "rule");
  const scenarios = step(behaviors, "illustrates", "in", "scenario");
  const claims = union(behaviors, rules, scenarios);
  const verifications = step(claims, "verifies", "in", "verification");
  const contracts = step(start, "exposes", "out", "contract");
  const decisions = step(union(start, behaviors, contracts), "informedBy", "out", "decision");
  const all = union(start, claims, verifications, contracts, decisions);
  return { ids: new Set([...all.ids].filter((id) => index.has(id))), wild: all.wild };
}
