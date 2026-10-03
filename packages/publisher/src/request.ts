/**
 * The publication request and the projection levels (Core §9).
 *
 * A request names one value per availability dimension, the flags the reader
 * is entitled to, the audience and the projection's visibility. Every one of
 * them is required: a request that leaves a dimension out is refused rather
 * than read as "any" (Core §7: no implicit wildcard; Core §4: missing access
 * information fails closed). Values must be ones the registries declare, so a
 * request for an unknown release is refused instead of quietly matching
 * nothing (Core §9: abstain when the requested version is unknown).
 *
 * Public projection admits public records only; customer admits public and
 * customer. Internal and restricted data need their own explicit
 * authorization, and a restricted projection, which admits internal records
 * too, needs both.
 */
import { type Diagnostic, type Graph, type Registries, VISIBILITIES, type Visibility } from "@intentset/core";
import { compareStrings, publicationDiagnostic, sortedUnique } from "./diagnostic.ts";

export interface PublicationRequest {
  visibility: Visibility;
  audience: string;
  product: string;
  release: string;
  role: string;
  edition: string;
  /** The flags the reader is entitled to. Empty means none. */
  flags: string[];
  /** Knowledge IDs requested; omitted means every eligible one. */
  ids?: string[];
  /** Explicit authorization for an internal or restricted projection. */
  authorizedInternal?: boolean;
  /** Explicit authorization for a restricted projection. */
  authorizedRestricted?: boolean;
}

/** The request as an index records it: authorization flags removed, flags and ids sorted. */
export interface IndexedRequest {
  visibility: Visibility;
  audience: string;
  product: string;
  release: string;
  role: string;
  edition: string;
  flags: string[];
  ids?: string[];
}

/** Core §9: the visibilities each projection admits. */
export const PROJECTION_ADMITS: Readonly<Record<Visibility, readonly Visibility[]>> = {
  public: ["public"],
  customer: ["public", "customer"],
  internal: ["public", "customer", "internal"],
  restricted: ["public", "customer", "internal", "restricted"],
};

/** The single-valued dimensions of a request, in the order they are reported. */
export const REQUEST_DIMENSIONS = ["audience", "product", "release", "role", "edition"] as const;
export type RequestDimension = (typeof REQUEST_DIMENSIONS)[number];

const REQUEST_KEYS = new Set<string>([
  "visibility",
  ...REQUEST_DIMENSIONS,
  "flags",
  "ids",
  "authorizedInternal",
  "authorizedRestricted",
]);

/** True when the request's projection admits a record of this visibility. */
export function admits(request: Pick<PublicationRequest, "visibility">, visibility: Visibility): boolean {
  return PROJECTION_ADMITS[request.visibility].includes(visibility);
}

/** The request without its authorization flags, for an index a reader may see. */
export function indexedRequest(request: PublicationRequest): IndexedRequest {
  const out: IndexedRequest = {
    visibility: request.visibility,
    audience: request.audience,
    product: request.product,
    release: request.release,
    role: request.role,
    edition: request.edition,
    flags: sortedUnique(request.flags),
  };
  if (request.ids !== undefined) out.ids = sortedUnique(request.ids);
  return out;
}

/**
 * Check a request before anything is selected: shape, authorization, and
 * values against the registries and the graph. Every problem is a PUB001 and
 * all of them are reported at once; any one refuses the whole request.
 */
export function checkRequest(
  value: unknown,
  graph: Graph,
  registries: Registries,
): { request: PublicationRequest | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const refuse = (message: string, remediation: string) =>
    diagnostics.push(publicationDiagnostic({ code: "PUB001", artifact: null, path: null, message, remediation }));

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    refuse(
      "The publication request is not a mapping of dimensions.",
      "Pass visibility, audience, product, release, role, edition and flags.",
    );
    return { request: null, diagnostics };
  }
  const raw = value as Record<string, unknown>;

  for (const key of Object.keys(raw).sort(compareStrings)) {
    if (!REQUEST_KEYS.has(key)) {
      refuse(
        `The request has an unknown key \`${key}\`.`,
        `Use only ${[...REQUEST_KEYS].join(", ")}; an unrecognized key is refused rather than ignored.`,
      );
    }
  }

  const visibility = raw.visibility;
  if (visibility === undefined || visibility === null) {
    refuse(
      "The request names no visibility, so no projection can be chosen.",
      "Set visibility to public, customer, internal or restricted; missing access information fails closed (Core §4).",
    );
  } else if (!(VISIBILITIES as readonly unknown[]).includes(visibility)) {
    refuse(
      "The request's visibility is not one of public, customer, internal or restricted.",
      "Name one of the four Core §4 visibilities.",
    );
  }

  for (const dimension of REQUEST_DIMENSIONS) {
    const v = raw[dimension];
    if (typeof v !== "string" || v === "") {
      refuse(
        `The request names no ${dimension}.`,
        `Name exactly one ${dimension}; availability has no implicit wildcard, so a missing dimension is refused (Core §7).`,
      );
    }
  }

  const flags = raw.flags;
  const flagsOk = Array.isArray(flags) && flags.every((flag) => typeof flag === "string" && flag !== "");
  if (flags === undefined || flags === null) {
    refuse(
      "The request names no flags.",
      "Pass the reader's enabled flags, or `flags: []` for none; an omission is refused rather than read as none (Core §7).",
    );
  } else if (!flagsOk) {
    refuse("The request's flags are not a list of flag names.", "Pass flags as a list of non-empty strings.");
  }

  const ids = raw.ids;
  if (ids !== undefined && !(Array.isArray(ids) && ids.every((id) => typeof id === "string" && id !== ""))) {
    refuse(
      "The request's ids are not a list of artifact IDs.",
      "Pass ids as a list of knowledge IDs, or omit it to publish every eligible one.",
    );
  }
  for (const key of ["authorizedInternal", "authorizedRestricted"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") {
      refuse(
        `The request's ${key} is not true or false.`,
        `Set ${key} to true only when the caller holds that authorization.`,
      );
    }
  }

  if (visibility === "internal" || visibility === "restricted") {
    if (raw.authorizedInternal !== true) {
      refuse(
        `${visibility === "internal" ? "An internal" : "A restricted"} projection was requested without internal authorization.`,
        "Internal records need explicit authorization: pass authorizedInternal only for a caller entitled to engineering material (Core §9).",
      );
    }
  }
  if (visibility === "restricted" && raw.authorizedRestricted !== true) {
    refuse(
      "A restricted projection was requested without restricted authorization.",
      "Restricted records need their own explicit authorization: pass authorizedRestricted only for a caller entitled to them (Core §9).",
    );
  }

  const known = (v: unknown, list: readonly string[]) => typeof v === "string" && list.includes(v);
  if (typeof raw.audience === "string" && raw.audience !== "" && !known(raw.audience, registries.audiences)) {
    refuse(
      `The request names audience ${raw.audience}, which the audience registry does not declare.`,
      "Request a registered audience.",
    );
  }
  if (
    typeof raw.product === "string" &&
    raw.product !== "" &&
    graph.artifacts.get(raw.product)?.meta.type !== "product"
  ) {
    refuse(
      `The request names product ${raw.product}, which is not a product in this snapshot.`,
      "Name the product artifact's ID, such as PRD-LANTERN.",
    );
  }
  for (const [dimension, list] of [
    ["release", registries.releases],
    ["role", registries.roles],
    ["edition", registries.editions],
  ] as const) {
    const v = raw[dimension];
    if (typeof v === "string" && v !== "" && !known(v, list)) {
      refuse(
        `The request names ${dimension} ${v}, which the registries do not declare.`,
        `Request a declared ${dimension}; release labels match exactly and an unknown one is refused rather than guessed (Core §7, §9).`,
      );
    }
  }
  if (flagsOk) {
    for (const flag of sortedUnique(flags as string[])) {
      if (!registries.flags.includes(flag)) {
        refuse(`The request names flag ${flag}, which the registries do not declare.`, "Request only declared flags.");
      }
    }
  }

  if (diagnostics.length > 0) return { request: null, diagnostics };
  const request: PublicationRequest = {
    visibility: visibility as Visibility,
    audience: raw.audience as string,
    product: raw.product as string,
    release: raw.release as string,
    role: raw.role as string,
    edition: raw.edition as string,
    flags: sortedUnique(flags as string[]),
  };
  if (ids !== undefined) request.ids = sortedUnique(ids as string[]);
  if (raw.authorizedInternal === true) request.authorizedInternal = true;
  if (raw.authorizedRestricted === true) request.authorizedRestricted = true;
  return { request, diagnostics };
}
