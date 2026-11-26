/**
 * The publication request and the projection levels (Core §9, publication §1).
 *
 * A request is for one reader (ADR 0029). It names the projection's
 * visibility, the reader's audience and role, each one value or a non-empty
 * list of every one the reader holds, one product, release and edition, and
 * the flags the reader is entitled to. A list is read as a set: order and
 * repeats change nothing, and `"teacher"` is the same request as
 * `["teacher"]`. Every field is required: a request that leaves one out, or
 * gives an empty audience or role list, is refused rather than read as "any"
 * (Core §7: no implicit wildcard; Core §4: missing access information fails
 * closed). Values must be ones the registries declare, every member of a list
 * included, so a request for an unknown release is refused instead of quietly
 * matching nothing (Core §9: abstain when the requested version is unknown).
 * `checkRequest` turns an accepted request into a `CheckedRequest`, with every
 * list sorted and unique, which every later stage reads. `keepUnderReview`,
 * optional and false when absent, asks for keepable knowledge to be published
 * marked under review (ADR 0027); any value but a boolean refuses the request.
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
  /** The reader's audience, or a non-empty list of every audience the reader is in. */
  audience: string | readonly string[];
  product: string;
  release: string;
  /** The reader's role, or a non-empty list of every role the reader holds. */
  role: string | readonly string[];
  edition: string;
  /** The flags the reader is entitled to. Empty means none. */
  flags: string[];
  /** Knowledge IDs requested; omitted means every eligible one. */
  ids?: string[];
  /**
   * Publish keepable knowledge, whose sources changed what they promise but not who may see them, marked under
   * review (publication §3, ADR 0027). Absent means false.
   */
  keepUnderReview?: boolean;
  /** Explicit authorization for an internal or restricted projection. */
  authorizedInternal?: boolean;
  /** Explicit authorization for a restricted projection. */
  authorizedRestricted?: boolean;
}

/** An accepted request: every list sorted by code unit without repeats, authorization stated. */
export interface CheckedRequest {
  visibility: Visibility;
  audience: string[];
  product: string;
  release: string;
  role: string[];
  edition: string;
  flags: string[];
  ids?: string[];
  keepUnderReview: boolean;
  authorizedInternal: boolean;
  authorizedRestricted: boolean;
}

/**
 * The request as an index records it (publication §4): authorization removed, members in this order, and every
 * list sorted without repeats. With its authorization added back it is a request that publishes the same bytes.
 */
export interface IndexedRequest {
  visibility: Visibility;
  audience: string[];
  product: string;
  release: string;
  role: string[];
  edition: string;
  flags: string[];
  ids?: string[];
  /** Written last, and only when the request named `true` (publication §4). */
  keepUnderReview?: true;
}

/** Core §9: the visibilities each projection admits. */
export const PROJECTION_ADMITS: Readonly<Record<Visibility, readonly Visibility[]>> = {
  public: ["public"],
  customer: ["public", "customer"],
  internal: ["public", "customer", "internal"],
  restricted: ["public", "customer", "internal", "restricted"],
};

/** The dimensions a request may give as a list, for a reader who holds more than one value. */
export const LIST_DIMENSIONS = ["audience", "role"] as const;
/** The dimensions a request gives one value each: a reader is on one product, release and edition at a time. */
export const SINGLE_DIMENSIONS = ["product", "release", "edition"] as const;
export type RequestDimension = (typeof LIST_DIMENSIONS)[number] | (typeof SINGLE_DIMENSIONS)[number];

const REQUEST_KEYS = new Set<string>([
  "visibility",
  "audience",
  "product",
  "release",
  "role",
  "edition",
  "flags",
  "ids",
  "keepUnderReview",
  "authorizedInternal",
  "authorizedRestricted",
]);

/** True when the request's projection admits a record of this visibility. */
export function admits(request: Pick<PublicationRequest, "visibility">, visibility: Visibility): boolean {
  return PROJECTION_ADMITS[request.visibility].includes(visibility);
}

/** The request without its authorization flags, for an index a reader may see. */
export function indexedRequest(request: CheckedRequest): IndexedRequest {
  const out: IndexedRequest = {
    visibility: request.visibility,
    audience: sortedUnique(request.audience),
    product: request.product,
    release: request.release,
    role: sortedUnique(request.role),
    edition: request.edition,
    flags: sortedUnique(request.flags),
  };
  if (request.ids !== undefined) out.ids = sortedUnique(request.ids);
  if (request.keepUnderReview) out.keepUnderReview = true;
  return out;
}

/** A list dimension's value as a sorted set: a string is a list of one; null for anything else, `[]` included. */
export function requestList(value: unknown): string[] | null {
  if (typeof value === "string") return value === "" ? null : [value];
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((member) => typeof member === "string" && member !== "")) return null;
  return sortedUnique(value as string[]);
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
): { request: CheckedRequest | null; diagnostics: Diagnostic[] } {
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

  const lists: Partial<Record<(typeof LIST_DIMENSIONS)[number], string[]>> = {};
  for (const dimension of LIST_DIMENSIONS) {
    const v = raw[dimension];
    const list = requestList(v);
    if (list !== null) lists[dimension] = list;
    else if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      refuse(
        `The request names no ${dimension}.`,
        `Name the reader's ${dimension}, or a list of every ${dimension} the reader holds; availability has no implicit wildcard, so a missing or empty ${dimension} is refused (Core §7).`,
      );
    } else {
      refuse(
        `The request's ${dimension} is not ${article(dimension)} ${dimension} name or a list of ${dimension} names.`,
        `Pass ${dimension} as a non-empty string, or a non-empty list of non-empty strings (publication §1).`,
      );
    }
  }
  for (const dimension of SINGLE_DIMENSIONS) {
    const v = raw[dimension];
    if (Array.isArray(v)) {
      refuse(
        `The request's ${dimension} is a list; a request is for one reader, on one ${dimension}.`,
        `Name one ${dimension}; only audience and role may be lists (publication §1).`,
      );
    } else if (typeof v !== "string" || v === "") {
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
  if (raw.keepUnderReview !== undefined && typeof raw.keepUnderReview !== "boolean") {
    refuse(
      "The request's keepUnderReview is not true or false.",
      "Set keepUnderReview to true to publish knowledge kept under review, or leave it out (publication §1, §3).",
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
  for (const audience of lists.audience ?? []) {
    if (!registries.audiences.includes(audience)) {
      refuse(
        `The request names audience ${audience}, which the audience registry does not declare.`,
        "Request a registered audience.",
      );
    }
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
  const unknown = (dimension: RequestDimension, v: string) =>
    refuse(
      `The request names ${dimension} ${v}, which the registries do not declare.`,
      `Request a declared ${dimension}; release labels match exactly and an unknown one is refused rather than guessed (Core §7, §9).`,
    );
  const release = raw.release;
  if (typeof release === "string" && release !== "" && !known(release, registries.releases))
    unknown("release", release);
  for (const role of lists.role ?? []) {
    if (!registries.roles.includes(role)) unknown("role", role);
  }
  const edition = raw.edition;
  if (typeof edition === "string" && edition !== "" && !known(edition, registries.editions))
    unknown("edition", edition);
  if (flagsOk) {
    for (const flag of sortedUnique(flags as string[])) {
      if (!registries.flags.includes(flag)) {
        refuse(`The request names flag ${flag}, which the registries do not declare.`, "Request only declared flags.");
      }
    }
  }

  if (diagnostics.length > 0) return { request: null, diagnostics };
  const request: CheckedRequest = {
    visibility: visibility as Visibility,
    audience: lists.audience as string[],
    product: raw.product as string,
    release: raw.release as string,
    role: lists.role as string[],
    edition: raw.edition as string,
    flags: sortedUnique(flags as string[]),
    keepUnderReview: raw.keepUnderReview === true,
    authorizedInternal: raw.authorizedInternal === true,
    authorizedRestricted: raw.authorizedRestricted === true,
  };
  if (ids !== undefined) request.ids = sortedUnique(ids as string[]);
  return { request, diagnostics };
}

function article(dimension: string): string {
  return /^[aeiou]/.test(dimension) ? "an" : "a";
}
