/**
 * How an evidence conformance case is run (tests/evidence.json), as one
 * function, so the harness's driver and this package's own fixture test
 * cannot differ. Another implementation reads the same contract here:
 *
 * 1. Validate the expanded tree at the case's level (core's pipeline).
 * 2. The snapshot is `FIXTURE_COMMIT`, the graph hash of the validated graph,
 *    and the scope named by the case's `request.product` and
 *    `request.release` (no scope filter when either is absent).
 * 3. Bind `@current` in the case's `evidence` to that snapshot, then read the
 *    records as if from `evidence.json`.
 * 4. Check locators against the tree's paths (documents and sources) only
 *    when the case supplies `sources`; a case without them has no tree to
 *    check against, and its locators are reported unresolved instead.
 * 5. Decide the binding (`resolveBinding`): the case's `.intentset/config.yaml`
 *    `evidence.binding`, else subject where the graph has slice claims, else
 *    commit with EVID004. Under subject binding the driver resolves what the
 *    architecture package knows (claimed files, import closures) over the
 *    tree of documents and sources into a `SubjectSource`, and every
 *    verification's subject is computed from it (`subjectsFor`).
 * 6. The case's `changedSince`, when it has one, answers the question git
 *    would: the files changed between a record's commit and the snapshot.
 *    A commit it does not list is one that is not an ancestor.
 * 7. The case's diagnostics are validation's plus the reader's plus the check's.
 */
import {
  type Diagnostic,
  type EvidenceBinding,
  type Graph,
  graphHash,
  type Level,
  sortDiagnostics,
} from "@intentset/core";
import { hasSliceClaims, resolveBinding, type SubjectSource, subjectsFor } from "./binding.ts";
import { type EvidenceCheck, checkEvidence } from "./check.ts";
import type { EvidenceSnapshot } from "./classify.ts";
import { bindPlaceholders, FIXTURE_COMMIT, requestedScope } from "./placeholders.ts";
import { readRunRecords } from "./records.ts";

export const FIXTURE_EVIDENCE_PATH = "evidence.json";

export interface FixtureEvidenceInput {
  /** The graph validation built from the expanded tree. */
  graph: Graph;
  level: Level;
  /** The case's `evidence` array, placeholders unbound. */
  evidence: readonly unknown[];
  /** The case's `request`, read for its product and release only. */
  request: { product?: string; release?: string } | null;
  /** Paths of the expanded tree's documents. */
  documents: Iterable<string>;
  /** Paths of the case's `sources`. */
  sources: Iterable<string>;
  /** `evidence.binding` of the case's configuration; null or absent when it states none. */
  configuredBinding?: EvidenceBinding | null;
  /** What the architecture package resolved over the tree; needed only when the binding in force is subject. */
  subjectSource?: SubjectSource;
  /** The case's `changedSince`: for a commit, the files changed between it and the snapshot. */
  changedSince?: Readonly<Record<string, readonly string[]>>;
}

export interface FixtureEvidenceRun extends EvidenceCheck {
  snapshot: EvidenceSnapshot;
  /** The reader's diagnostics followed by the check's, sorted. Validation's are the caller's to add. */
  diagnostics: Diagnostic[];
}

export function checkFixtureEvidence(input: FixtureEvidenceInput): FixtureEvidenceRun {
  const decision = resolveBinding(input.configuredBinding ?? null, hasSliceClaims(input.graph));
  const base: EvidenceSnapshot = {
    commit: FIXTURE_COMMIT,
    graphHash: graphHash(input.graph),
    scope: requestedScope(input.request),
  };
  const snapshot: EvidenceSnapshot = { ...base, binding: decision.binding, bindingReason: decision.reason };
  if (decision.binding === "subject" && input.subjectSource !== undefined) {
    snapshot.subjects = subjectsFor(input.graph, input.subjectSource);
    snapshot.covers = input.subjectSource.covers;
    if (input.changedSince !== undefined) {
      const changed = input.changedSince;
      snapshot.changedSince = (commit) => changed[commit] ?? null;
    }
  }
  const read = readRunRecords(bindPlaceholders(input.evidence, snapshot), FIXTURE_EVIDENCE_PATH);
  const sources = [...input.sources];
  const files = sources.length > 0 ? new Set([...input.documents, ...sources]) : undefined;
  const checked = checkEvidence(input.graph, read.records, snapshot, {
    level: input.level,
    files,
    evidencePath: FIXTURE_EVIDENCE_PATH,
  });
  return {
    ...checked,
    snapshot,
    diagnostics: sortDiagnostics([...read.diagnostics, ...checked.diagnostics]),
  };
}
