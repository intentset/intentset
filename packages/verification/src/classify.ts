/**
 * Evidence freshness (Core §8, invariant 3). Only a `pass` at the assessed
 * commit and graph hash is current; everything else is something else, and
 * says which. A failing run at the snapshot stays visible however many older
 * passes there are, because the status is decided by the latest run at the
 * snapshot and every run is kept in the history.
 */
import { type Diagnostic, type Graph, sortDiagnostics } from "@intentset/core";
import { compareStrings, evidenceDiagnostic } from "./diagnostic.ts";
import { CURRENT, compareRecords, type RunRecord, type RunResult, type RunScope } from "./records.ts";

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
}

export type ResultCounts = Record<RunResult, number>;

export interface VerificationEvidence {
  verificationId: string;
  method: "automated" | "manual";
  status: EvidenceStatus;
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
  snapshot: { commit: string | null; graphHash: string; scope: RunScope | null };
  /** One entry per verification artifact in the graph, keyed and ordered by ID. */
  verifications: Record<string, VerificationEvidence>;
  /** Records whose scope named another product or release, across every verification. */
  ignoredOutOfScope: number;
  /** Records naming an ID that is not a verification in the graph (EVID002), by evidence ID. */
  unknown: RunRecord[];
  /** Records that cannot be evidence for the verification they name (EVID001), by evidence ID. */
  rejected: RejectedRecord[];
  /** EVID001 and EVID002, sorted. */
  diagnostics: Diagnostic[];
}

export interface ClassifyOptions {
  /** The file the records were read from, for diagnostics; null when they did not come from one. */
  evidencePath?: string | null;
}

const NOTE_COMMIT_UNKNOWN = "commit unknown; matched on graph hash";

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

  const verifications: Record<string, VerificationEvidence> = {};
  for (const id of ids) {
    const artifact = graph.artifacts.get(id);
    const history = (inScope.get(id) ?? []).sort(compareRecords);
    verifications[id] = classifyOne(
      id,
      artifact?.meta.verification?.method ?? "automated",
      history,
      outOfScope.get(id) ?? 0,
      snapshot,
    );
  }

  return {
    snapshot: { commit: snapshot.commit, graphHash: snapshot.graphHash, scope },
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
): VerificationEvidence {
  const counts: ResultCounts = { pass: 0, fail: 0, skip: 0, error: 0 };
  const base = { verificationId, method, history, atSnapshot: counts, outOfScope };
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

  const current = history.filter((record) => atSnapshot(record, snapshot));
  for (const record of current) counts[record.result]++;
  if (current.length === 0) {
    return withNote({ ...base, status: "stale", latest: history[history.length - 1] }, [ignored]);
  }

  const latest = current[current.length - 1];
  const status: EvidenceStatus =
    latest.result === "pass" ? "current-pass" : latest.result === "fail" ? "current-fail" : latest.result;
  return withNote({ ...base, status, latest }, [snapshot.commit === null ? NOTE_COMMIT_UNKNOWN : null, ignored]);
}

function withNote(evidence: Omit<VerificationEvidence, "note">, notes: (string | null)[]): VerificationEvidence {
  const present = notes.filter((note): note is string => note !== null);
  const { verificationId, method, status, latest, history, atSnapshot: counts, outOfScope } = evidence;
  return {
    verificationId,
    method,
    status,
    ...(present.length > 0 ? { note: present.join("; ") } : {}),
    latest,
    history,
    atSnapshot: counts,
    outOfScope,
  };
}
