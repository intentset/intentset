/**
 * Core §7 and §5, ADR 0020: an approval's basis and a formalized requirement, each in one line of plain text, for
 * the views that show a record (the CLI's context, the Atlas). The words say what the record states and nothing
 * more: a basis is the repository's statement, and no view reads it as a permission.
 */
import type { Approval, ExportApproval, ExportFormalized, Formalized } from "./types.ts";

/** One line for an approval: its basis, who and when, and for a derived one the source and the state approved. */
export function approvalSummary(approval: Approval | ExportApproval): string {
  const parts: string[] = [approval.basis];
  const source = approval.source ?? null;
  if (source !== null) {
    const state = [
      source.revision == null ? null : `revision ${source.revision}`,
      source.digest == null ? null : `digest ${source.digest}`,
    ].filter((part) => part !== null);
    parts.push(`from ${source.ref} at ${state.join(", ")}`);
  }
  if (approval.by != null) parts.push(`by ${approval.by}`);
  if (approval.attestedBy != null) parts.push(`attested by ${approval.attestedBy}`);
  parts.push(`at ${approval.at}`);
  return parts.join(", ");
}

/** One formalized requirement: its source, with the anchor in parentheses when it names one. */
export function formalizedSummary(entry: Formalized | ExportFormalized): string {
  return entry.anchor == null ? entry.source : `${entry.source} (${entry.anchor})`;
}
