/**
 * A record's content hash (publication §3, ADR 0018): what a review pins
 * when it pins `content-v1`. It covers what the record promises, and leaves
 * out where the record stands in its lifecycle and who reviewed it, so that
 * approving, implementing or marking delivery does not send every guide that
 * explains the record back to review.
 *
 * The hash is SHA-256 over the canonical JSON (ADR 0005) of
 * `{ body, frontmatter, ending }`:
 *
 * - `frontmatter` is the whole parsed frontmatter, `markset` and unknown
 *   top-level keys included, without `status`, `delivery`, `reviewedBy`,
 *   `reviewedAt`, `approval`, `formalizes` and `review` under `intentset`,
 *   and without the `intentset.org/review` extension (and `extensions` itself
 *   when nothing else is in it). `approval` says how the record was approved
 *   and `formalizes` where its promise came from (ADR 0020); neither is the
 *   promise. `review` is a knowledge record's own pins, which 0.3 moved out of
 *   that extension (ADR 0025); both are left out, so no hash taken before the
 *   move differs from the one taken after it over the same record;
 * - `body` is everything after the frontmatter, as written;
 * - `ending` is the status when it is `deprecated` or `retired`, and absent
 *   otherwise, so a record that is going away still moves the hash: what a
 *   guide explains is ending, and its reader needs to know.
 *
 * Because it is taken over parsed values, a change of key order, quoting or
 * indentation in the frontmatter does not move it.
 *
 * A record's *own content hash* is the same hash without `ending` (ADR 0027):
 * what a knowledge review's `self` pins, so deprecating reviewed knowledge does
 * not count as editing its text. The *gate hash* is SHA-256 over the canonical
 * JSON of who could see each source of a review: its audiences, visibility and
 * availability. It covers neither `spec` nor `profile`, so no migration moves it.
 */
import { canonicalJson, sha256Hex } from "./hash.ts";

/** The `intentset` fields a content hash leaves out: lifecycle, review, approval and provenance, not promise. */
export const CONTENT_HASH_OMITS = [
  "status",
  "delivery",
  "reviewedBy",
  "reviewedAt",
  "approval",
  "formalizes",
  "review",
] as const;
/** The extension a content hash leaves out: the review's own pins as 0.2 wrote them (ADR 0025), CORE001 since 0.3. */
export const CONTENT_HASH_OMITS_EXTENSION = "intentset.org/review";
/** The statuses a content hash names, because a record in them is going away. */
export const ENDING_STATUSES = ["deprecated", "retired"] as const;

/** The content hash of a record from its parsed frontmatter and its body (publication §3, ADR 0018). */
export function contentHashOf(
  frontmatter: Record<string, unknown>,
  body: string,
  options: { ending?: boolean } = {},
): string {
  const copy: Record<string, unknown> = { ...frontmatter };
  const section = frontmatter.intentset;
  let ending: string | undefined;
  if (isRecord(section)) {
    const intentset: Record<string, unknown> = { ...section };
    if (
      options.ending !== false &&
      typeof section.status === "string" &&
      (ENDING_STATUSES as readonly string[]).includes(section.status)
    ) {
      ending = section.status;
    }
    for (const key of CONTENT_HASH_OMITS) delete intentset[key];
    if (isRecord(section.extensions)) {
      const extensions: Record<string, unknown> = { ...section.extensions };
      delete extensions[CONTENT_HASH_OMITS_EXTENSION];
      if (Object.keys(extensions).length === 0) delete intentset.extensions;
      else intentset.extensions = extensions;
    }
    copy.intentset = intentset;
  }
  return sha256Hex(canonicalJson({ body, frontmatter: copy, ending }));
}

/** A record's own content hash: its content hash without `ending`, what a review's `self` pins (ADR 0027). */
export function ownContentHashOf(frontmatter: Record<string, unknown>, body: string): string {
  return contentHashOf(frontmatter, body, { ending: false });
}

/** Who could see one source of a review: its audiences, sorted, its visibility and its availability as parsed, or null. */
export interface ReviewGate {
  audiences: readonly string[];
  visibility: string;
  availability: unknown;
}

/**
 * The gate hash of a review's sources (publication §3, ADR 0027): SHA-256 over the canonical JSON of an object keyed
 * by source ID, each `{ audiences (sorted), visibility, availability }`, or null for a source no record has.
 */
export function gateHashOf(entries: ReadonlyArray<readonly [id: string, gate: ReviewGate | null]>): string {
  const object: Record<string, unknown> = {};
  for (const [id, gate] of entries) {
    object[id] =
      gate === null
        ? null
        : {
            audiences: [...gate.audiences].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
            visibility: gate.visibility,
            availability: gate.availability ?? null,
          };
  }
  return sha256Hex(canonicalJson(object));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
