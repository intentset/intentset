/**
 * The audience and release projection (Core §9, catalog P01, P03-P06).
 *
 * Deny by default: an artifact is eligible only when every check passes, and
 * the first that fails is recorded as the reason it was excluded, so a report
 * can count exclusions by kind. The checks, in order:
 *
 *   not-requested         the request names ids and this is not one of them
 *   not-knowledge         only knowledge is ever published as a document
 *   draft, retired        Core §7: neither is current publication
 *   visibility            outside what the projection admits
 *   audience              the request's audience is not one the knowledge is written for
 *   availability-missing  no availability block: fails closed (Core §4, §7)
 *   product ... edition   the request's value is not in that dimension's list (AND across, OR within)
 *   flag                  the knowledge needs a flag the request does not name (all named flags required)
 *   needs-review          a source changed since review, a pin is missing, or no reviewer (review.ts)
 *
 * An explicitly requested ID that is not eligible is CORE008. Its message
 * names the reason class, and nothing about the artifact beyond its ID. When
 * the artifact's visibility is outside the projection, or no artifact has the
 * ID, the message is the same in both cases and carries no path: a caller
 * without the authorization cannot learn whether an internal ID exists.
 */
import { type Artifact, type Diagnostic, type Graph, type Registries, graphHash } from "@intentset/core";
import { compareStrings, publicationDiagnostic } from "./diagnostic.ts";
import { type PublicationRequest, admits, checkRequest } from "./request.ts";
import { type ReviewStatus, reviewStatus } from "./review.ts";

export const EXCLUSION_REASONS = [
  "not-requested",
  "not-knowledge",
  "draft",
  "retired",
  "visibility",
  "audience",
  "availability-missing",
  "product",
  "release",
  "role",
  "edition",
  "flag",
  "needs-review",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

/** The snapshot a publication is made from (Core §7): the commit, or null when none could be read, and the graph hash. */
export interface Snapshot {
  commit: string | null;
  graphHash: string;
}

export interface ProjectOptions {
  snapshot: Snapshot;
  /** Review statuses already computed, by knowledge ID; `reviewStatus` is used for any not given. */
  reviews?: ReadonlyMap<string, ReviewStatus>;
}

export interface Exclusion {
  id: string;
  reason: ExclusionReason;
}

export interface Projection {
  /** Eligible knowledge, sorted by ID. */
  eligible: Artifact[];
  /** Every other artifact in the graph with the first check it failed, sorted by ID. Empty when the request was refused. */
  excluded: Exclusion[];
  diagnostics: Diagnostic[];
  /** The checked request, or null when it was refused (PUB001). */
  request: PublicationRequest | null;
}

const PUBLISHABLE_STATUSES = new Set(["approved", "implemented", "released", "deprecated"]);

/** Core §9: select what this request may publish, before any text is sent to a renderer. */
export function project(
  graph: Graph,
  registries: Registries,
  request: PublicationRequest,
  options: ProjectOptions,
): Projection {
  const checked = checkRequest(request, graph, registries);
  const diagnostics = [...checked.diagnostics];
  if (graphHash(graph) !== options.snapshot.graphHash) {
    diagnostics.push(
      publicationDiagnostic({
        code: "PUB001",
        artifact: null,
        path: null,
        message: "The snapshot's graph hash is not the hash of the graph being published.",
        remediation:
          "Publish from the graph the snapshot names; provenance must identify the exact snapshot (Core §7, §9).",
      }),
    );
  }
  if (checked.request === null || diagnostics.length > 0) {
    return { eligible: [], excluded: [], diagnostics, request: null };
  }
  const req = checked.request;
  const requested = req.ids === undefined ? null : new Set(req.ids);
  const reviews = new Map<string, ReviewStatus>(options.reviews ?? []);
  const review = (artifact: Artifact): ReviewStatus => {
    let status = reviews.get(artifact.meta.id);
    if (status === undefined) {
      status = reviewStatus(graph, artifact);
      reviews.set(artifact.meta.id, status);
    }
    return status;
  };

  const eligible: Artifact[] = [];
  const excluded: Exclusion[] = [];
  const reasons = new Map<string, ExclusionReason>();
  for (const id of [...graph.artifacts.keys()].sort(compareStrings)) {
    const artifact = graph.artifacts.get(id) as Artifact;
    const reason = requested !== null && !requested.has(id) ? "not-requested" : exclusionReason(artifact, req, review);
    if (reason === null) eligible.push(artifact);
    else {
      excluded.push({ id, reason });
      reasons.set(id, reason);
    }
  }

  for (const id of req.ids ?? []) {
    const reason = reasons.get(id);
    const artifact = graph.artifacts.get(id);
    if (artifact !== undefined && reason === undefined) continue;
    diagnostics.push(refusal(id, artifact, reason ?? null, req, artifact === undefined ? null : review(artifact)));
  }
  return { eligible, excluded, diagnostics, request: req };
}

/** The first check an artifact fails for this request, or null when it is eligible. Requested-ness is the caller's. */
export function exclusionReason(
  artifact: Artifact,
  request: PublicationRequest,
  review: (artifact: Artifact) => ReviewStatus,
): Exclude<ExclusionReason, "not-requested"> | null {
  const { meta } = artifact;
  if (meta.type !== "knowledge") return "not-knowledge";
  if (meta.status === "draft") return "draft";
  if (meta.status === "retired") return "retired";
  if (!PUBLISHABLE_STATUSES.has(meta.status)) return "draft";
  if (!admits(request, meta.visibility)) return "visibility";
  if (!meta.audiences.includes(request.audience)) return "audience";
  const availability = meta.availability;
  if (availability === undefined) return "availability-missing";
  if (!availability.products.includes(request.product)) return "product";
  if (!availability.releases.includes(request.release)) return "release";
  if (!availability.roles.includes(request.role)) return "role";
  if (!availability.editions.includes(request.edition)) return "edition";
  if (!availability.flags.every((flag) => request.flags.includes(flag))) return "flag";
  if (review(artifact).status !== "current") return "needs-review";
  return null;
}

/** CORE008 for one requested ID. */
function refusal(
  id: string,
  artifact: Artifact | undefined,
  reason: ExclusionReason | null,
  request: PublicationRequest,
  review: ReviewStatus | null,
): Diagnostic {
  if (artifact === undefined || !admits(request, artifact.meta.visibility)) {
    return publicationDiagnostic({
      code: "CORE008",
      artifact: id,
      path: null,
      message: `${id} was requested but is not publishable (visibility): no artifact with that ID is visible to a ${request.visibility} projection.`,
      remediation:
        "Request only knowledge this projection admits; anything else needs a separately authorized projection (Core §9).",
    });
  }
  const { meta } = artifact;
  const at = { artifact: id, path: artifact.path };
  const refuse = (field: string | undefined, detail: string, remediation: string) =>
    publicationDiagnostic({
      code: "CORE008",
      ...at,
      field,
      message: `${id} was requested but is not publishable (${reason}): ${detail}.`,
      remediation,
    });
  switch (reason) {
    case "not-knowledge":
      return refuse(
        "/intentset/type",
        `it is a ${meta.type}, and only knowledge is published`,
        "Request the knowledge that explains it; engineering artifacts are never published as documents (Core §9).",
      );
    case "draft":
      return refuse(
        "/intentset/status",
        `its status is ${meta.status}, and drafts are never published`,
        "Review the knowledge and set its status to approved or later before publishing it (Core §7, §9).",
      );
    case "retired":
      return refuse(
        "/intentset/status",
        "it is retired, which is excluded from current publication",
        "Publish the successor named in replacedBy instead (Core §7).",
      );
    case "audience":
      return refuse(
        "/intentset/audiences",
        `it is not written for the ${request.audience} audience`,
        "Request an audience the knowledge lists, or add this one after reviewing the text for it (Core §9).",
      );
    case "availability-missing":
      return refuse(
        "/intentset/availability",
        "it declares no availability, so publication fails closed",
        "Add availability with products, releases, roles, editions and flags (Core §7).",
      );
    case "product":
    case "release":
    case "role":
    case "edition":
      return refuse(
        `/intentset/availability/${reason}s`,
        `it is not available for ${reason} ${request[reason]}`,
        `Request a ${reason} the knowledge lists, or extend its availability after review; values match exactly (Core §7).`,
      );
    case "flag": {
      const needed = (meta.availability?.flags ?? [])
        .filter((flag) => !request.flags.includes(flag))
        .sort(compareStrings);
      return refuse(
        "/intentset/availability/flags",
        `it requires flag${needed.length === 1 ? "" : "s"} ${needed.join(", ")}, which the request does not name`,
        "Request every flag the knowledge names; all named flags are required (Core §7).",
      );
    }
    default:
      return refuse(
        review !== null && review.reviewer === null
          ? "/intentset/reviewedBy"
          : `/intentset/extensions/intentset.org~1review`,
        `it needs review because ${describeReview(review)}`,
        "Review the knowledge against its current sources, then update reviewedBy, reviewedAt and the intentset.org/review pins (Core §9).",
      );
  }
}

function describeReview(review: ReviewStatus | null): string {
  if (review === null) return "its review could not be read";
  const parts: string[] = [];
  if (review.changed.length > 0) parts.push(`${review.changed.join(", ")} changed since it was reviewed`);
  if (review.missing.length > 0) parts.push(`its review pins nothing for ${review.missing.join(", ")}`);
  if (review.reviewer === null) parts.push("it names no reviewer");
  if (review.reviewedAt === null) parts.push("it gives no review date");
  return parts.length === 0 ? "its review is not current" : parts.join(", and ");
}
