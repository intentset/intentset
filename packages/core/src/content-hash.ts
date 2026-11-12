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
 *   top-level keys included, without `status`, `delivery`, `reviewedBy` and
 *   `reviewedAt` under `intentset`, and without the `intentset.org/review`
 *   extension (and `extensions` itself when nothing else is in it);
 * - `body` is everything after the frontmatter, as written;
 * - `ending` is the status when it is `deprecated` or `retired`, and absent
 *   otherwise, so a record that is going away still moves the hash: what a
 *   guide explains is ending, and its reader needs to know.
 *
 * Because it is taken over parsed values, a change of key order, quoting or
 * indentation in the frontmatter does not move it.
 */
import { canonicalJson, sha256Hex } from "./hash.ts";

/** The `intentset` fields a content hash leaves out: lifecycle and review, not promise. */
export const CONTENT_HASH_OMITS = ["status", "delivery", "reviewedBy", "reviewedAt"] as const;
/** The extension a content hash leaves out: the review's own pins. */
export const CONTENT_HASH_OMITS_EXTENSION = "intentset.org/review";
/** The statuses a content hash names, because a record in them is going away. */
export const ENDING_STATUSES = ["deprecated", "retired"] as const;

/** The content hash of a record from its parsed frontmatter and its body (publication §3, ADR 0018). */
export function contentHashOf(frontmatter: Record<string, unknown>, body: string): string {
  const copy: Record<string, unknown> = { ...frontmatter };
  const section = frontmatter.intentset;
  let ending: string | undefined;
  if (isRecord(section)) {
    const intentset: Record<string, unknown> = { ...section };
    if (typeof section.status === "string" && (ENDING_STATUSES as readonly string[]).includes(section.status)) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
