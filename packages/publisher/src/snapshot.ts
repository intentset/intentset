/**
 * The snapshot file (spec/publication.md §6): the commit and graph hash a
 * publication was made from, in a file of its own beside the documents.
 *
 * It is the one file of a publication that names the snapshot (ADR 0021).
 * Both values move with every commit that changes a record, so any other
 * file that carried them would be rewritten by every publication, whatever
 * it says; with them here, the documents, the index, the help file and the
 * chunks are the same bytes for the same model, request and `publishedAt`,
 * at any commit. The file carries nothing of the request, so every
 * projection published in one run writes the same bytes.
 */
import type { Snapshot } from "./project.ts";

export const SNAPSHOT_PROFILE = "intentset/snapshot/0.2";
/** The file's name beside the published documents. */
export const SNAPSHOT_FILE = "snapshot.json";

/** `snapshot.json`, in the order it is written. */
export interface SnapshotFile {
  profile: typeof SNAPSHOT_PROFILE;
  derived: true;
  /** The commit published from, or null when none could be read. */
  commit: string | null;
  /** The hash of the graph published from. */
  graphHash: string;
}

/** The snapshot file for a publication made from `snapshot`. */
export function snapshotFile(snapshot: Snapshot): SnapshotFile {
  return { profile: SNAPSHOT_PROFILE, derived: true, commit: snapshot.commit, graphHash: snapshot.graphHash };
}
