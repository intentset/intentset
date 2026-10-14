/**
 * Which binding judges run evidence (Core §8, ADR 0013) and the subjects it
 * needs. The decision is pure: the repository's configuration and whether it
 * has slice claims. Computing a subject needs what the architecture package
 * resolves (claimed files, import closures), which this package does not
 * depend on, so a caller hands it in as a `SubjectSource`.
 */
import type { EvidenceBinding, Graph } from "@intentset/core";
import { compareStrings } from "./diagnostic.ts";
import { ABSENT, computeSubject, type Subject, type SubjectInput } from "./subject.ts";
import { sha256Hex } from "@intentset/core";

export interface BindingDecision {
  binding: EvidenceBinding;
  /** `configured`, `default` (subject, since slices exist) or `no-slices` (commit, since there is nothing to hash). */
  reason: "configured" | "default" | "no-slices";
}

/**
 * Core §8: `binding: subject` is the default wherever the repository has slice
 * claims; `binding: commit` is the stricter mode a repository or gate asks
 * for; a repository with no slice claims is judged by commit binding unless it
 * asked for that, and says so (EVID004), whatever it asked for.
 */
export function resolveBinding(configured: EvidenceBinding | null, hasSlices: boolean): BindingDecision {
  if (configured === "commit") return { binding: "commit", reason: "configured" };
  if (!hasSlices) return { binding: "commit", reason: "no-slices" };
  return { binding: "subject", reason: configured === "subject" ? "configured" : "default" };
}

/** True when some slice that is not retired claims files: the repository has a subject to hash. */
export function hasSliceClaims(graph: Graph): boolean {
  for (const artifact of graph.artifacts.values()) {
    if (
      artifact.meta.type === "slice" &&
      artifact.meta.status !== "retired" &&
      (artifact.meta.slice?.claims.length ?? 0) > 0
    )
      return true;
  }
  return false;
}

/** What a caller resolves for the subject hash: the architecture package's claims and imports, over one tree. */
export type SubjectSource = Omit<SubjectInput, "graph" | "verificationId"> & {
  /** True for a file that can move some subject: a slice's, a used resource's, a global input, a test, a record. */
  covers: (path: string) => boolean;
};

/** The subject of every verification in the graph, by ID, with each file hashed once. */
export function subjectsFor(graph: Graph, source: SubjectSource): Map<string, Subject> {
  const hashes = new Map<string, string>();
  const fileHash = (path: string): string => {
    let hash = hashes.get(path);
    if (hash === undefined) {
      const bytes = source.readFile(path);
      hash = bytes === undefined ? ABSENT : sha256Hex(bytes);
      hashes.set(path, hash);
    }
    return hash;
  };
  const subjects = new Map<string, Subject>();
  const ids = [...graph.artifacts.keys()].filter((id) => graph.artifacts.get(id)?.meta.type === "verification");
  for (const id of ids.sort(compareStrings)) {
    subjects.set(id, computeSubject({ ...source, graph, verificationId: id, fileHash }));
  }
  return subjects;
}
