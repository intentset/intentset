/**
 * The evidence check (Core §8, §11): classification, coverage, and the
 * diagnostics that follow from them. CORE007 joins at L3, where current
 * passing evidence is a conformance requirement; below L3 missing evidence is
 * not a diagnostic, but the coverage report still shows every gap.
 */
import { type Diagnostic, type Graph, type Level, LEVELS, sortDiagnostics } from "@intentset/core";
import { type Classification, classifyEvidence, type EvidenceSnapshot, type EvidenceStatus } from "./classify.ts";
import { type CoverageReport, compareUnresolved, coverage } from "./coverage.ts";
import { compareStrings, evidenceDiagnostic } from "./diagnostic.ts";
import type { RunRecord } from "./records.ts";

export interface CheckEvidenceOptions {
  level?: Level;
  /**
   * Every repository-relative path in the tree. When given, each
   * verification's locator must name one of them (EVID003); when absent the
   * locators are not checked and each is listed as unresolved.
   */
  files?: ReadonlySet<string>;
  /** The file the records were read from, for diagnostics about a record. */
  evidencePath?: string | null;
}

export interface EvidenceCheck {
  /**
   * EVID001 (graph-aware), EVID002, EVID003 and, at L3 and above, CORE007 (an
   * error for a required claim, a warning for a draft claim with no
   * verification definition); sorted, origin "evidence".
   */
  diagnostics: Diagnostic[];
  classification: Classification;
  coverage: CoverageReport;
}

const PHRASES: Record<EvidenceStatus, string> = {
  "current-pass": "passed at this snapshot",
  "current-fail": "failed at this snapshot",
  stale: "is stale, with runs only at another commit or graph hash",
  skip: "was skipped at this snapshot",
  error: "errored at this snapshot",
  missing: "has no run record",
  unresolved: "could not be classified",
};

export function checkEvidence(
  graph: Graph,
  records: readonly RunRecord[],
  snapshot: EvidenceSnapshot,
  options: CheckEvidenceOptions = {},
): EvidenceCheck {
  const level = options.level ?? "L1";
  const classification = classifyEvidence(graph, records, snapshot, { evidencePath: options.evidencePath ?? null });
  const report = coverage(graph, classification, { level });
  const diagnostics: Diagnostic[] = [...classification.diagnostics];

  for (const id of Object.keys(classification.verifications)) {
    const artifact = graph.artifacts.get(id);
    const locator = artifact?.meta.verification?.locator;
    if (artifact === undefined || locator === undefined || artifact.meta.status === "retired") continue;
    if (options.files === undefined) {
      report.unresolved.push({ subject: id, reason: `locator ${locator} not checked: no file tree was supplied` });
    } else if (!options.files.has(locator)) {
      diagnostics.push(
        evidenceDiagnostic({
          code: "EVID003",
          severity: "warning",
          artifact: id,
          path: artifact.path,
          field: "/intentset/verification/locator",
          message: `Verification ${id} names the locator ${locator}, which is not a file in the repository tree.`,
          remediation:
            "Correct the locator to the repository-relative path of the test or review procedure, or add the file.",
        }),
      );
    }
  }
  report.unresolved.sort(compareUnresolved);

  if (LEVELS.indexOf(level) >= LEVELS.indexOf("L3")) {
    for (const claim of report.perClaim) {
      // A draft claim is not required yet, but one with no verification at all
      // is a gap CI output should show (decided 2026-10-03, after the Streamlane
      // pilot reported nothing at L3 while two rules had no test): a warning,
      // never an error, and only for a missing definition, not a missing run.
      if (!claim.required && claim.lifecycle === "draft" && claim.verifications.length === 0) {
        diagnostics.push(
          evidenceDiagnostic({
            code: "CORE007",
            severity: "warning",
            artifact: claim.id,
            path: claim.path,
            message: `Draft ${claim.type} ${claim.id} has no verification definition naming it in verifies; it is not required while draft, and will fail L3 once approved.`,
            remediation: `Add a verification whose links.verifies names ${claim.id} before the claim leaves draft (Core §8).`,
          }),
        );
        continue;
      }
      if (!claim.required || claim.verified) continue;
      const subject = `${capitalize(claim.lifecycle)} ${claim.type} ${claim.id}`;
      if (claim.verifications.length === 0) {
        diagnostics.push(
          evidenceDiagnostic({
            code: "CORE007",
            artifact: claim.id,
            path: claim.path,
            message: `${subject} has no verification definition naming it in verifies, so it cannot be verified in this snapshot.`,
            remediation: `Add a verification whose links.verifies names ${claim.id}, then record a passing run at the snapshot (Core §8).`,
          }),
        );
        continue;
      }
      const failing = claim.verifications.filter((v) => v.status !== "current-pass");
      const where = `commit ${snapshot.commit ?? "(unknown)"} and graph hash ${snapshot.graphHash.slice(0, 12)}`;
      diagnostics.push(
        evidenceDiagnostic({
          code: "CORE007",
          artifact: claim.id,
          path: claim.path,
          message: `${subject} is not verified in this snapshot: ${failing.map((v) => `${v.id} ${PHRASES[v.status]}`).join("; ")}.`,
          remediation: `Record a passing run of ${failing
            .map((v) => v.id)
            .sort(compareStrings)
            .join(
              ", ",
            )} at ${where}, fixing whatever failed first; stale, skipped and errored runs never count (Core §8).`,
        }),
      );
    }
  }

  return { diagnostics: sortDiagnostics(diagnostics), classification, coverage: report };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
