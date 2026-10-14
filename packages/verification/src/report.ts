/**
 * `reports.evidence` for the export (spec/export.md §4.1): the classification
 * and the per-claim coverage of one evidence check, in the shape a consumer
 * displays without reinterpreting. No totals and no percentage: a consumer
 * shows each verification's status and each claim's, and the difference
 * between missing, stale, failed and passed stays visible (Core §8).
 */
import type { EvidenceReportSection } from "@intentset/core";
import type { EvidenceCheck } from "./check.ts";
import type { RunRecord } from "./records.ts";

export interface EvidenceReportOptions {
  /**
   * Added to the note of every verification: the export contract (0.3) judges a record at the snapshot's commit and
   * graph hash and has no member for the binding, so a caller whose repository uses another says so here.
   */
  note?: string;
}

/** A record as the export contract's `runRecord` has it: the members of spec/evidence.schema.json without `binding` and `subjectHash`. */
function exported(record: RunRecord | null): EvidenceReportSection["verifications"][number]["latest"] {
  if (record === null) return null;
  const { binding: _binding, subjectHash: _subjectHash, ...rest } = record;
  return rest;
}

/** The evidence report of a check that classified `records` run records. */
export function evidenceReport(
  check: EvidenceCheck,
  records: number,
  options: EvidenceReportOptions = {},
): EvidenceReportSection {
  const { classification, coverage } = check;
  return {
    commit: classification.snapshot.commit,
    graphHash: classification.snapshot.graphHash,
    scope: classification.snapshot.scope,
    records,
    verifications: Object.values(classification.verifications).map((v) => ({
      id: v.verificationId,
      method: v.method,
      status: v.status,
      note: [v.note, options.note].filter((n): n is string => n !== undefined).join("; ") || null,
      latest: exported(v.latest),
      atSnapshot: { ...v.atSnapshot },
      runs: v.history.length,
      outOfScope: v.outOfScope,
    })),
    claims: coverage.perClaim.map((claim) => ({
      id: claim.id,
      type: claim.type,
      lifecycle: claim.lifecycle,
      required: claim.required,
      linked: claim.linked,
      verified: claim.verified,
      verifications: claim.verifications.map((v) => v.id),
      withheld: 0,
    })),
  };
}
