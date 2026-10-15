/**
 * Evidence freshness (Core §8, invariant 3). Only a `pass` whose binding holds
 * is current: under commit binding, at the assessed commit and graph hash;
 * under subject binding, while the subject it checked is unchanged. Everything
 * else is something else, and says which. A failing current run stays visible
 * however many older passes there are, because the status is decided by the
 * latest current run and every run is kept in the history.
 */
import {
  type Diagnostic,
  type EvidenceBinding,
  type EvidenceBindingReason,
  type Graph,
  sortDiagnostics,
} from "@intentset/core";
import { compareStrings, evidenceDiagnostic } from "./diagnostic.ts";
import { CURRENT, compareRecords, type RunRecord, type RunResult, type RunScope } from "./records.ts";
import { partsChangedAmong, type Subject } from "./subject.ts";

export const EVIDENCE_STATUSES = [
  "current-pass",
  "current-fail",
  "stale",
  "skip",
  "error",
  "missing",
  "unresolved",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** What evidence is assessed against: a commit and graph hash, and the product and release it is for. */
export interface EvidenceSnapshot {
  /** The assessed commit, or null when none could be read: matching then uses the graph hash alone, and says so. */
  commit: string | null;
  /** The graph hash of the snapshot (ADR 0005). */
  graphHash: string;
  /** The exact product and release under assessment. Absent or null considers records of every scope, and reports that it did. */
  scope?: RunScope | null;
  /** The binding in force (Core §8); commit when absent, as before the field existed. */
  binding?: EvidenceBinding;
  /**
   * Why the binding is the one in force: `configured` (the repository asked), `default` (subject, because slices
   * exist) or `no-slices` (commit, because the repository has no slice claims to hash and did not ask for it,
   * which EVID004 says). Absent reads as `configured`.
   */
  bindingReason?: EvidenceBindingReason;
  /** Under subject binding: the subject of each verification at the snapshot, by verification ID. */
  subjects?: ReadonlyMap<string, Subject>;
  /**
   * The files changed between a record's commit and the assessed commit, or null when the commit is not an
   * ancestor of it or git is unavailable. Optional: it only makes the notes and EVID005 more specific.
   */
  changedSince?: (commit: string) => readonly string[] | null;
  /** True for a file that can move some subject: claimed, a used resource's, a global input, a test, a record. */
  covers?: (path: string) => boolean;
}

export type ResultCounts = Record<RunResult, number>;

export interface VerificationEvidence {
  verificationId: string;
  method: "automated" | "manual";
  status: EvidenceStatus;
  /** The binding that judged this verification. */
  binding: EvidenceBinding;
  /** Under subject binding, the hash of the subject it was judged at; null under commit binding and when none could be computed. */
  subject: string | null;
  /** Why the status is qualified or what was set aside, when anything was. */
  note?: string;
  /** The record that decided the status: the latest at the snapshot, else the latest in scope; null when there is none. */
  latest: RunRecord | null;
  /** Every in-scope record for this verification, oldest first (finishedAt, then evidenceId). */
  history: RunRecord[];
  /** Results of the records at the snapshot, so a failure followed by a pass is still countable. */
  atSnapshot: ResultCounts;
  /** Records for this verification that named another product or release and were not considered. */
  outOfScope: number;
}

export interface RejectedRecord {
  record: RunRecord;
  reason: string;
}

export interface Classification {
  snapshot: {
    commit: string | null;
    graphHash: string;
    scope: RunScope | null;
    binding: EvidenceBinding;
    /** Why this binding is in force (`configured` when the caller did not say). */
    bindingReason: EvidenceBindingReason;
  };
  /** One entry per verification artifact in the graph, keyed and ordered by ID. */
  verifications: Record<string, VerificationEvidence>;
  /** Records whose scope named another product or release, across every verification. */
  ignoredOutOfScope: number;
  /** Records naming an ID that is not a verification in the graph (EVID002), by evidence ID. */
  unknown: RunRecord[];
  /** Records that cannot be evidence for the verification they name (EVID001), by evidence ID. */
  rejected: RejectedRecord[];
  /** EVID001, EVID002, EVID004, EVID005, EVID006 and EVID007, sorted. */
  diagnostics: Diagnostic[];
}

export interface ClassifyOptions {
  /** The file the records were read from, for diagnostics; null when they did not come from one. */
  evidencePath?: string | null;
}

const NOTE_COMMIT_UNKNOWN = "commit unknown; matched on graph hash";

/** The most files EVID005 lists; the rest are counted. */
export const UNCLAIMED_LIMIT = 20;

/** The most verifications EVID006 lists, and the most files it lists for each resource; the rest are counted. */
export const UNEXERCISED_LIMIT = 20;
const UNEXERCISED_FILES = 5;

/** The most verifications EVID007 lists, and the most files it lists for each dependency slice; the rest are counted. */
export const DEPENDENCY_INTERNALS_LIMIT = 20;
const DEPENDENCY_INTERNALS_FILES = 5;

/** What EVID007 collects: per dependency slice, the changed files of it outside its entrypoints and the current verifications that depend on it. */
type Internals = Map<string, { files: Set<string>; verifications: Set<string> }>;

/** What EVID006 collects: per resource, the changed files of it and the current verifications that use it without exercising it. */
type Unexercised = Map<string, { files: Set<string>; verifications: Set<string> }>;

const short = (commit: string) => commit.slice(0, 9);

/** Core §8: classify every verification in the graph against the snapshot. Deterministic for identical inputs. */
export function classifyEvidence(
  graph: Graph,
  records: readonly RunRecord[],
  snapshot: EvidenceSnapshot,
  options: ClassifyOptions = {},
): Classification {
  const path = options.evidencePath ?? null;
  const scope = snapshot.scope ?? null;
  const diagnostics: Diagnostic[] = [];
  const unknown: RunRecord[] = [];
  const rejected: RejectedRecord[] = [];
  const inScope = new Map<string, RunRecord[]>();
  const outOfScope = new Map<string, number>();
  let ignoredOutOfScope = 0;

  const ids = [...graph.artifacts.keys()]
    .filter((id) => graph.artifacts.get(id)?.meta.type === "verification")
    .sort(compareStrings);
  for (const id of ids) inScope.set(id, []);

  const ordered = [...records].sort((a, b) => compareStrings(a.evidenceId, b.evidenceId) || compareRecords(a, b));
  for (const record of ordered) {
    const target = graph.artifacts.get(record.verificationId);
    if (target === undefined || target.meta.type !== "verification") {
      unknown.push(record);
      diagnostics.push(
        evidenceDiagnostic({
          code: "EVID002",
          severity: "warning",
          artifact: null,
          path,
          message:
            target === undefined
              ? `Run record ${record.evidenceId} names ${record.verificationId}, which is not in the graph, so it is evidence for nothing.`
              : `Run record ${record.evidenceId} names ${record.verificationId}, which is a ${target.meta.type}, not a verification.`,
          remediation:
            "Point the record at the verification it ran, or create that verification; runs are evidence for verifications only (Core §8).",
        }),
      );
      continue;
    }
    if (target.meta.verification?.method === "manual" && record.reviewer === null) {
      const reason = `${record.verificationId} is a manual review, and record ${record.evidenceId} names no reviewer.`;
      rejected.push({ record, reason });
      diagnostics.push(
        evidenceDiagnostic({
          code: "EVID001",
          artifact: record.verificationId,
          path,
          message: `Run record ${record.evidenceId} names no reviewer, but ${record.verificationId} is a manual review.`,
          remediation:
            "Record who performed the review and the rationale; a manual record must identify both (Core §8).",
        }),
      );
      continue;
    }
    if (scope !== null && (record.scope.product !== scope.product || record.scope.release !== scope.release)) {
      ignoredOutOfScope++;
      outOfScope.set(record.verificationId, (outOfScope.get(record.verificationId) ?? 0) + 1);
      continue;
    }
    inScope.get(record.verificationId)?.push(record);
  }

  const binding = snapshot.binding ?? "commit";
  if (snapshot.bindingReason === "no-slices") {
    diagnostics.push(
      evidenceDiagnostic({
        code: "EVID004",
        severity: "warning",
        artifact: null,
        path: null,
        message:
          "No slice claims files, so there is no subject to bind evidence to: it is judged by commit binding (a record is current only at the assessed commit and graph hash).",
        remediation:
          "Declare slices with claims (VSA §3) so evidence can stay current while its subject is unchanged, or set `evidence.binding: commit` in .intentset/config.yaml to choose this on purpose (Core §8).",
      }),
    );
  }

  const verifications: Record<string, VerificationEvidence> = {};
  const unclaimed = new Set<string>();
  const unexercised: Unexercised = new Map();
  const internals: Internals = new Map();
  for (const id of ids) {
    const artifact = graph.artifacts.get(id);
    const history = (inScope.get(id) ?? []).sort(compareRecords);
    verifications[id] = classifyOne(
      id,
      artifact?.meta.verification?.method ?? "automated",
      history,
      outOfScope.get(id) ?? 0,
      snapshot,
      binding,
      unclaimed,
      unexercised,
      internals,
    );
  }
  // A file of a resource EVID006 reports is not listed here as well: EVID006 says more (which verifications use it).
  for (const entry of unexercised.values()) for (const file of entry.files) unclaimed.delete(file);
  if (unclaimed.size > 0) {
    const files = [...unclaimed].sort(compareStrings);
    const listed = files.slice(0, UNCLAIMED_LIMIT);
    diagnostics.push(
      evidenceDiagnostic({
        code: "EVID005",
        severity: "warning",
        artifact: null,
        path: null,
        message: `${files.length} file${files.length === 1 ? "" : "s"} changed since the commit of a subject-bound record and no slice claims, no exercised resource names and no global input lists ${files.length === 1 ? "it" : "them"}, so ${files.length === 1 ? "it" : "they"} cannot make any evidence stale: ${listed.join(", ")}${files.length > listed.length ? `, and ${files.length - listed.length} more` : ""}.`,
        remediation:
          "Claim the file in a slice (the architecture check's unclaimed files rule), name its resource in a verification's `exercises`, or list it in `evidence.globalInputs` if it affects every check (Core §8).",
      }),
    );
  }
  if (unexercised.size > 0) {
    const resources = [...unexercised].sort(([a], [b]) => compareStrings(a, b));
    const all = new Set<string>();
    for (const [, entry] of resources) for (const id of entry.verifications) all.add(id);
    const verifications = [...all].sort(compareStrings);
    const listed = verifications.slice(0, UNEXERCISED_LIMIT);
    const what = resources.map(([id, entry]) => {
      const files = [...entry.files].sort(compareStrings);
      const shown = files.slice(0, UNEXERCISED_FILES).join(", ");
      return `${id} (${shown}${files.length > UNEXERCISED_FILES ? `, and ${files.length - UNEXERCISED_FILES} more` : ""})`;
    });
    diagnostics.push(
      evidenceDiagnostic({
        code: "EVID006",
        severity: "warning",
        artifact: null,
        path: null,
        message: `${verifications.length} verification${verifications.length === 1 ? " is" : "s are"} current though a resource ${verifications.length === 1 ? "it uses" : "they use"} and ${verifications.length === 1 ? "does" : "do"} not exercise changed since the commit of ${verifications.length === 1 ? "its" : "their"} record: ${what.join("; ")}; ${listed.join(", ")}${verifications.length > listed.length ? `, and ${verifications.length - listed.length} more` : ""}.`,
        remediation:
          "Where a check does depend on that resource, name it in the verification's `exercises` so a change to it makes the record stale, or set `evidence.resources: used` to hash every resource a slice lists (Core §8).",
      }),
    );
  }

  if (internals.size > 0) {
    const slices = [...internals].sort(([a], [b]) => compareStrings(a, b));
    const all = new Set<string>();
    for (const [, entry] of slices) for (const id of entry.verifications) all.add(id);
    const verifications = [...all].sort(compareStrings);
    const listed = verifications.slice(0, DEPENDENCY_INTERNALS_LIMIT);
    const what = slices.map(([id, entry]) => {
      const files = [...entry.files].sort(compareStrings);
      const shown = files.slice(0, DEPENDENCY_INTERNALS_FILES).join(", ");
      return `${id} (${shown}${files.length > DEPENDENCY_INTERNALS_FILES ? `, and ${files.length - DEPENDENCY_INTERNALS_FILES} more` : ""})`;
    });
    diagnostics.push(
      evidenceDiagnostic({
        code: "EVID007",
        severity: "warning",
        artifact: null,
        path: null,
        message: `${verifications.length} verification${verifications.length === 1 ? " is" : "s are"} current though a slice ${verifications.length === 1 ? "it depends" : "they depend"} on changed outside its entrypoints and contracts since the commit of ${verifications.length === 1 ? "its" : "their"} record: ${what.join("; ")}; ${listed.join(", ")}${verifications.length > listed.length ? `, and ${verifications.length - listed.length} more` : ""}.`,
        remediation:
          "Where a check does depend on that slice's internals, name the slice in the verification's `exercises` so a change to it makes the record stale, or set `evidence.dependencies: files` to hash every file a dependency claims (Core §8).",
      }),
    );
  }

  return {
    snapshot: {
      commit: snapshot.commit,
      graphHash: snapshot.graphHash,
      scope,
      binding,
      bindingReason: snapshot.bindingReason ?? "configured",
    },
    verifications,
    ignoredOutOfScope,
    unknown,
    rejected,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

/** True when a record was made at the snapshot: same graph hash, and same commit unless the snapshot's is unknown. */
export function atSnapshot(record: RunRecord, snapshot: { commit: string | null; graphHash: string }): boolean {
  return record.graphHash === snapshot.graphHash && (snapshot.commit === null || record.commit === snapshot.commit);
}

function classifyOne(
  verificationId: string,
  method: "automated" | "manual",
  history: RunRecord[],
  outOfScope: number,
  snapshot: EvidenceSnapshot,
  binding: EvidenceBinding,
  unclaimed: Set<string>,
  unexercised: Unexercised,
  internals: Internals,
): VerificationEvidence {
  const counts: ResultCounts = { pass: 0, fail: 0, skip: 0, error: 0 };
  const subjectHash = binding === "subject" ? (snapshot.subjects?.get(verificationId)?.hash ?? null) : null;
  const base = { verificationId, method, binding, subject: subjectHash, history, atSnapshot: counts, outOfScope };
  const ignored =
    outOfScope > 0 ? `${outOfScope} record${outOfScope === 1 ? "" : "s"} for another product or release ignored` : null;

  if (history.length === 0) {
    return withNote({ ...base, status: "missing", latest: null }, [ignored]);
  }

  const unbound = history.filter(
    (record) => record.graphHash === CURRENT || (snapshot.commit !== null && record.commit === CURRENT),
  );
  if (unbound.length > 0) {
    const names = unbound.map((record) => record.evidenceId).join(", ");
    return withNote({ ...base, status: "unresolved", latest: history[history.length - 1] }, [
      `unbound @current placeholder in ${names}; bind it to the snapshot before classifying`,
      ignored,
    ]);
  }

  const subject = snapshot.subjects?.get(verificationId);
  if (binding === "subject" && subject === undefined) {
    return withNote({ ...base, status: "unresolved", latest: history[history.length - 1] }, [
      "subject binding is in force but no subject could be computed for this verification",
      ignored,
    ]);
  }

  const current =
    binding === "subject"
      ? history.filter((record) => record.binding === "subject" && record.subjectHash === subject?.hash)
      : history.filter((record) => record.binding !== "subject" && atSnapshot(record, snapshot));
  for (const record of current) counts[record.result]++;
  if (current.length === 0) {
    const latest = history[history.length - 1];
    return withNote({ ...base, status: "stale", latest }, [staleNote(latest, binding, subject, snapshot), ignored]);
  }

  const latest = current[current.length - 1];
  const status: EvidenceStatus =
    latest.result === "pass" ? "current-pass" : latest.result === "fail" ? "current-fail" : latest.result;
  const notes: (string | null)[] = [];
  if (binding === "subject") {
    const unlisted = collectUnclaimed(latest, snapshot, unclaimed);
    collectUnexercised(verificationId, latest, subject, snapshot, unexercised);
    collectInternals(verificationId, latest, subject, snapshot, internals);
    notes.push(`judged by subject binding; the run was at commit ${short(latest.commit)}${unlisted}`);
  } else if (snapshot.commit === null) notes.push(NOTE_COMMIT_UNKNOWN);
  notes.push(ignored);
  return withNote({ ...base, status, latest }, notes);
}

/** Why the latest record is not current under the binding in force, with what moved when that can be said. */
function staleNote(
  latest: RunRecord,
  binding: EvidenceBinding,
  subject: Subject | undefined,
  snapshot: EvidenceSnapshot,
): string | null {
  if (binding === "commit") {
    return latest.binding === "subject"
      ? "latest record is bound to a subject, not to a commit; a gate that asks for commit binding needs a run imported at this commit with commit binding"
      : null;
  }
  if (latest.binding !== "subject") {
    return `latest record is bound to commit ${short(latest.commit)}, not to a subject, so subject binding judges it stale; it can be re-imported to bind it to the subject`;
  }
  if (snapshot.changedSince === undefined || subject === undefined) return "the subject changed since the run";
  const changed = snapshot.changedSince(latest.commit);
  if (changed === null) {
    return `the subject changed since the run; which part moved is unknown, because commit ${short(latest.commit)} is not an ancestor of the assessed commit or git is unavailable`;
  }
  const parts = partsChangedAmong(subject, new Set(changed));
  return parts.length === 0
    ? `the subject changed since the run at commit ${short(latest.commit)}, in a part no changed file names (a file that left the subject, or a record moved)`
    : `the subject changed since the run at commit ${short(latest.commit)}: ${parts.slice(0, 5).join(", ")}${parts.length > 5 ? `, and ${parts.length - 5} more` : ""}`;
}

/** Collects what changed outside every subject since a current record's commit (EVID005), and says when that cannot be known. */
function collectUnclaimed(latest: RunRecord, snapshot: EvidenceSnapshot, unclaimed: Set<string>): string {
  if (snapshot.changedSince === undefined || snapshot.covers === undefined) return "";
  const changed = snapshot.changedSince(latest.commit);
  if (changed === null) {
    return `; files changed since then could not be listed, because the commit is not an ancestor of the assessed commit or git is unavailable`;
  }
  for (const path of changed) if (!snapshot.covers(path)) unclaimed.add(path);
  return "";
}

/**
 * Collects the resources a current record's verification uses without exercising (EVID006) whose files changed since
 * the record's commit: the subject cannot see them, so the record stays current, and the report says so. It asks for
 * the same `changedSince` as EVID005, and has nothing to say when that cannot be answered (EVID005's note says so).
 */
function collectUnexercised(
  verificationId: string,
  latest: RunRecord,
  subject: Subject | undefined,
  snapshot: EvidenceSnapshot,
  unexercised: Unexercised,
): void {
  if (snapshot.changedSince === undefined || subject === undefined || subject.unexercised.length === 0) return;
  const changed = snapshot.changedSince(latest.commit);
  if (changed === null || changed.length === 0) return;
  const moved = new Set(changed);
  for (const resource of subject.unexercised) {
    const files = resource.files.filter((path) => moved.has(path));
    if (files.length === 0) continue;
    const entry = unexercised.get(resource.id) ?? { files: new Set<string>(), verifications: new Set<string>() };
    for (const path of files) entry.files.add(path);
    entry.verifications.add(verificationId);
    unexercised.set(resource.id, entry);
  }
}

/**
 * Collects the dependency slices a current record's verification counts only through their entrypoints and contracts
 * (EVID007) whose other files changed since the record's commit: the subject cannot see them, so the record stays
 * current, and the report says so. Like EVID006 it has nothing to say when git cannot answer.
 */
function collectInternals(
  verificationId: string,
  latest: RunRecord,
  subject: Subject | undefined,
  snapshot: EvidenceSnapshot,
  internals: Internals,
): void {
  if (snapshot.changedSince === undefined || subject === undefined || subject.dependencyInternals.length === 0) return;
  const changed = snapshot.changedSince(latest.commit);
  if (changed === null || changed.length === 0) return;
  const moved = new Set(changed);
  for (const slice of subject.dependencyInternals) {
    const files = slice.files.filter((path) => moved.has(path));
    if (files.length === 0) continue;
    const entry = internals.get(slice.id) ?? { files: new Set<string>(), verifications: new Set<string>() };
    for (const path of files) entry.files.add(path);
    entry.verifications.add(verificationId);
    internals.set(slice.id, entry);
  }
}

function withNote(evidence: Omit<VerificationEvidence, "note">, notes: (string | null)[]): VerificationEvidence {
  const present = notes.filter((note): note is string => note !== null);
  const {
    verificationId,
    method,
    binding,
    subject,
    status,
    latest,
    history,
    atSnapshot: counts,
    outOfScope,
  } = evidence;
  return {
    verificationId,
    method,
    status,
    binding,
    subject,
    ...(present.length > 0 ? { note: present.join("; ") } : {}),
    latest,
    history,
    atSnapshot: counts,
    outOfScope,
  };
}
