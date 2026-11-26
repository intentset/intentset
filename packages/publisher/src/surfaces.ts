/**
 * The help file's surfaces (spec/publication.md §5, VSA §3, ADR 0028): for each surface a slice declares, the
 * documents published in the run that lead it, in the order the slice declares them.
 *
 * A surface is written only when every one of these holds, checked in this order, and the first that fails is the
 * reason its slice's surfaces were left out:
 *
 *   draft, retired        the slice's status is not one at which knowledge may be published (an allow-list)
 *   not-built             its effective delivery (Core §7) is not `built`
 *   availability-missing  it declares no availability: fails closed (Core §4)
 *   unavailable           the request fails its availability, by the test knowledge passes (one role suffices)
 *   declared-twice        another slice that is not retired declares the same surface ID (CORE013): written from neither
 *   restricted            the slice is restricted and the request is not authorized for restricted data (Core §9)
 *   reference             the surface ID holds, word-bounded, the ID of an artifact the projection does not admit
 *                         (other than the requested product), or the repository path of an artifact not published
 *   nothing-published     none of its knowledge has a document in this run (a document kept under review counts)
 *
 * The key is written whatever the slice's visibility below `restricted`, as a tip's key is (Core §9), and nothing
 * else of the slice is written. An omission is recorded only for a slice whose visibility the projection admits, so
 * nothing downstream can name or count the others (design invariants 4 and 6).
 */
import { type Artifact, type Graph, type SliceSurface, deliveryOf } from "@intentset/core";
import { compareStrings } from "./diagnostic.ts";
import { PUBLISHABLE_STATUSES, availabilityReason } from "./project.ts";
import { idsInText, pathsInText } from "./references.ts";
import { type CheckedRequest, admits } from "./request.ts";

export const OMISSION_REASONS = [
  "draft",
  "retired",
  "not-built",
  "availability-missing",
  "unavailable",
  "declared-twice",
  "restricted",
  "reference",
  "nothing-published",
] as const;
export type OmissionReason = (typeof OMISSION_REASONS)[number];

/**
 * A slice some of whose surfaces were left out of the help file, by ID only and once per reason: never a surface ID,
 * which may hold what the reader may not see. Recorded only when the projection admits the slice.
 */
export interface OmittedSurface {
  slice: string;
  reason: OmissionReason;
}

export interface HelpSurfaces {
  /** By surface ID in code-unit order: the documents published in the run that lead it, in declared order. */
  surfaces: Record<string, SliceSurface>;
  /** Sorted by slice, then reason in the order above; only slices whose visibility the projection admits. */
  omitted: OmittedSurface[];
}

/**
 * The surfaces of a help file, given every document written in the run by knowledge ID (current and kept under
 * review) and the checked request.
 */
export function helpSurfaces(graph: Graph, documentIds: Iterable<string>, request: CheckedRequest): HelpSurfaces {
  const published = new Set(documentIds);
  const slices = [...graph.artifacts.values()]
    .filter((artifact) => artifact.meta.type === "slice" && artifact.meta.slice?.surfaces !== undefined)
    .sort((a, b) => compareStrings(a.meta.id, b.meta.id));
  // CORE013's condition exactly: every slice that is not retired, drafts included.
  const declarers = new Map<string, number>();
  for (const slice of slices) {
    if (slice.meta.status === "retired") continue;
    for (const key of Object.keys(slice.meta.slice?.surfaces ?? {})) declarers.set(key, (declarers.get(key) ?? 0) + 1);
  }
  const written = new Map<string, SliceSurface>();
  const omitted: OmittedSurface[] = [];
  for (const slice of slices) {
    const surfaces = slice.meta.slice?.surfaces ?? {};
    const sliceReason = sliceOmission(slice, request);
    const reasons = new Set<OmissionReason>();
    for (const key of Object.keys(surfaces).sort(compareStrings)) {
      const knowledge = surfaces[key].knowledge.filter((id) => published.has(id));
      const reason =
        sliceReason ??
        ((declarers.get(key) ?? 0) > 1 ? "declared-twice" : null) ??
        (slice.meta.visibility === "restricted" && !request.authorizedRestricted ? "restricted" : null) ??
        (keyRefers(key, graph, published, request) ? "reference" : null) ??
        (knowledge.length === 0 ? "nothing-published" : null);
      if (reason === null) written.set(key, { knowledge });
      else if (admits(request, slice.meta.visibility)) reasons.add(reason);
    }
    for (const reason of OMISSION_REASONS) if (reasons.has(reason)) omitted.push({ slice: slice.meta.id, reason });
  }
  const out: Record<string, SliceSurface> = {};
  for (const key of [...written.keys()].sort(compareStrings)) out[key] = written.get(key) as SliceSurface;
  return { surfaces: out, omitted };
}

/** The first slice-wide condition that fails, or null. */
function sliceOmission(slice: Artifact, request: CheckedRequest): OmissionReason | null {
  const { meta } = slice;
  if (meta.status === "retired") return "retired";
  if (!PUBLISHABLE_STATUSES.has(meta.status)) return "draft";
  if (deliveryOf(meta) !== "built") return "not-built";
  const availability = availabilityReason(meta.availability, request);
  if (availability === "availability-missing") return "availability-missing";
  if (availability !== null) return "unavailable";
  return null;
}

/** Publication §4's tests on a surface ID: an ID the projection does not admit, or the path of an unpublished record. */
function keyRefers(key: string, graph: Graph, published: ReadonlySet<string>, request: CheckedRequest): boolean {
  for (const { id } of idsInText(key)) {
    const artifact = graph.artifacts.get(id);
    if (artifact === undefined || id === request.product) continue;
    if (!admits(request, artifact.meta.visibility)) return true;
  }
  return pathsInText(key, graph).some(({ id }) => !published.has(id));
}
