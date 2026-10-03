/**
 * The sections a level adds to a report, as text and as JSON. Every count
 * says what it counts and over what; what could not be checked is listed as
 * not checked, never folded into a pass (invariant 6); coverage is counts
 * and never a percentage (Core §8).
 */
import type { ArchitectureResult } from "@intentset/architecture";
import type { ClaimCounts } from "@intentset/verification";
import { count } from "./output.ts";
import type { EvidenceRun, Session } from "./session.ts";

export function architectureLines(result: ArchitectureResult, skipped: readonly string[]): string[] {
  const s = result.summary;
  const lines = [
    `Architecture (${s.level}, ${s.mode} mode): ${count(s.slices, "active slice")}; ` +
      `${count(s.filesClaimed, "file")} claimed, ${s.filesUnclaimed} unclaimed, ${s.outOfScope} out of scope (counted, not reported); ` +
      `${count(s.edges, "import edge")}, ${s.crossSliceEdges} across slices; ${count(s.cycles, "cycle")}; ` +
      `${s.excepted} excepted, ${s.baselined} baselined, ${count(s.baselineStale, "stale baseline entry", "stale baseline entries")}`,
    `Not checked, so not a pass (${s.unresolved.length}):${s.unresolved.length === 0 ? " none" : ""}`,
    ...s.unresolved.map((item) => `  - ${item}`),
    `Left to review, which this check cannot decide from source (${s.reviewRequired.length}):`,
    ...s.reviewRequired.map((item) => `  - ${item}`),
  ];
  if (skipped.length > 0) {
    lines.push(`Not read, over 1 MiB (${skipped.length}):`, ...skipped.map((path) => `  - ${path}`));
  }
  return lines;
}

function ofCounts(part: ClaimCounts, whole: ClaimCounts): string {
  return [
    `${part.behaviors} of ${count(whole.behaviors, "behavior")}`,
    `${part.rules} of ${count(whole.rules, "rule")}`,
    `${part.scenarios} of ${count(whole.scenarios, "scenario")}`,
  ].join(", ");
}

export function evidenceLines(run: EvidenceRun): string[] {
  const { coverage, classification } = run.check;
  const snap = run.snapshot;
  const scope =
    snap.scope === null || snap.scope === undefined
      ? "every product and release"
      : `${snap.scope.product} ${snap.scope.release}`;
  const from = run.files.length === 0 ? "no evidence files" : run.files.join(", ");
  const d = coverage.denominator;
  const lines = [
    `Evidence: ${count(run.records, "run record")} from ${from}; assessed at ${snap.commit === null ? "no commit" : `commit ${snap.commit}`}, graph ${snap.graphHash}, for ${scope}`,
    `Coverage over ${count(d.behaviors, "behavior")}, ${count(d.rules, "rule")} and ${count(d.scenarios, "scenario")} that are not retired:`,
    `  linked:    ${ofCounts(coverage.linked, d)}  (${coverage.measures.linked})`,
    `  verified:  ${ofCounts(coverage.verified, d)}  (${coverage.measures.verified})`,
    `  manual:    linked ${ofCounts(coverage.manual.linked, d)}; verified ${ofCounts(coverage.manual.verified, d)}`,
    `  automated: linked ${ofCounts(coverage.automated.linked, d)}; verified ${ofCounts(coverage.automated.verified, d)}`,
    "Verifications at this snapshot:",
  ];
  const ids = Object.keys(classification.verifications);
  if (ids.length === 0) lines.push("  none");
  for (const id of ids) {
    const v = classification.verifications[id];
    lines.push(`  ${id}  ${v.method}  ${v.status}${v.note === undefined ? "" : `  (${v.note})`}`);
  }
  lines.push(
    `Not checked, so not a pass (${coverage.unresolved.length}):${coverage.unresolved.length === 0 ? " none" : ""}`,
  );
  for (const item of coverage.unresolved) lines.push(`  - ${item.subject}: ${item.reason}`);
  return lines;
}

export function publicationLines(checked: readonly string[]): string[] {
  return [
    `Publication readiness: ${count(checked.length, "active knowledge artifact")} checked for a current review and availability${
      checked.length === 0 ? "" : ` (${checked.join(", ")})`
    }`,
  ];
}

/** Every section the session's level added, as text lines, blank-line separated. */
export function levelSections(session: Session): string[] {
  const sections: string[][] = [];
  if (session.architecture !== undefined)
    sections.push(architectureLines(session.architecture, session.tree?.skipped ?? []));
  if (session.evidence !== undefined) sections.push(evidenceLines(session.evidence));
  if (session.publication !== undefined) sections.push(publicationLines(session.publication.checked));
  return sections.flatMap((lines) => ["", ...lines]);
}

/** The same sections as JSON members. */
export function levelJson(session: Session): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (session.architecture !== undefined) {
    out.architecture = { summary: session.architecture.summary, skipped: session.tree?.skipped ?? [] };
  }
  if (session.evidence !== undefined) {
    const { files, records, snapshot, check } = session.evidence;
    const verifications: Record<string, unknown> = {};
    for (const [id, v] of Object.entries(check.classification.verifications)) {
      verifications[id] = { method: v.method, status: v.status, ...(v.note === undefined ? {} : { note: v.note }) };
    }
    out.evidence = { files, records, snapshot, coverage: check.coverage, verifications };
  }
  if (session.publication !== undefined) out.publication = { checked: session.publication.checked };
  return out;
}
