/**
 * The `@current` placeholder contract, for fixtures and the harness.
 *
 * A conformance case cannot know its graph hash in advance: the hash is
 * computed over the tree the case expands to. So a fixture writes the literal
 * `@current` for `commit` and `graphHash` when it means "the snapshot under
 * assessment", and the driver binds it with `bindPlaceholders` before reading
 * the records. Anything else (a 40-character commit, a 64-character hash) is
 * taken literally, which is how a fixture says "stale".
 *
 * Binding is the caller's job and is never silent: a record that still
 * carries `@current` when it is classified is `unresolved`, not current.
 */
import { CURRENT, type RunScope } from "./records.ts";

export { CURRENT };

/**
 * The commit the evidence fixtures are assessed at. Any value works so long
 * as no fixture writes it literally; fixtures write `@current` instead, and
 * their stale records use other commits.
 */
export const FIXTURE_COMMIT = "1234567890abcdef1234567890abcdef12345678";

export interface PlaceholderSnapshot {
  commit: string | null;
  graphHash: string;
}

/**
 * Replace `@current` in each record's `commit` and `graphHash` with the
 * snapshot's values. Works on raw parsed JSON as well as on read records, and
 * returns copies: the input is not changed. A null snapshot commit leaves a
 * `@current` commit in place, since there is nothing to bind it to; matching
 * then uses the graph hash alone (classify.ts).
 */
export function bindPlaceholders<T>(records: readonly T[], snapshot: PlaceholderSnapshot): T[] {
  return records.map((record) => {
    if (typeof record !== "object" || record === null || Array.isArray(record)) return record;
    const copy: Record<string, unknown> = { ...(record as Record<string, unknown>) };
    if (copy.graphHash === CURRENT) copy.graphHash = snapshot.graphHash;
    if (copy.commit === CURRENT && snapshot.commit !== null) copy.commit = snapshot.commit;
    return copy as T;
  });
}

/** The scope a fixture requests, from the case's `request` product and release; null unless both are named. */
export function requestedScope(request: { product?: string; release?: string } | null | undefined): RunScope | null {
  if (request?.product === undefined || request.release === undefined) return null;
  return { product: request.product, release: request.release };
}
