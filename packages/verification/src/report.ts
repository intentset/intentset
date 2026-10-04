/**
 * `reports.evidence` for the export (spec/export.md §4.1): the classification
 * and the per-claim coverage of one evidence check, in the shape a consumer
 * displays without reinterpreting. No totals and no percentage: a consumer
 * shows each verification's status and each claim's, and the difference
 * between missing, stale, failed and passed stays visible (Core §8).
 */
import type { EvidenceReportSection } from "@intentset/core";
import type { EvidenceCheck } from "./check.ts";

/** The evidence report of a check that classified `records` run records. */
export function evidenceReport(check: EvidenceCheck, records: number): EvidenceReportSection {
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
      note: v.note ?? null,
      latest: v.latest,
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
