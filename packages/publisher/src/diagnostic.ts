/**
 * Publication diagnostics (ADR 0004): one shape, origin "publication",
 * members in contract order, optional members present only when known.
 *
 * One rule governs every message built with this: a diagnostic may name an
 * artifact the projection does not admit by its ID, never by its title or
 * its path (Core §9, CLAUDE.md invariant 4). Callers pass `path: null` for
 * such an artifact.
 */
import type { Diagnostic, Location } from "@intentset/core";

export interface PublicationFields {
  code: string;
  severity?: "error" | "warning";
  artifact: string | null;
  path: string | null;
  location?: Location;
  field?: string;
  message: string;
  remediation: string;
}

export function publicationDiagnostic(fields: PublicationFields): Diagnostic {
  return {
    code: fields.code,
    severity: fields.severity ?? "error",
    origin: "publication",
    artifact: fields.artifact,
    path: fields.path,
    ...(fields.location !== undefined ? { location: fields.location } : {}),
    ...(fields.field !== undefined ? { field: fields.field } : {}),
    message: fields.message,
    remediation: fields.remediation,
  };
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sorted, duplicates removed. */
export function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStrings);
}
