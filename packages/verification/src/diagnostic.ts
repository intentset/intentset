/**
 * Evidence diagnostics in core's shape and key order (ADR 0004). Core keeps
 * its constructor private, so this is the one place the evidence package
 * builds a Diagnostic. Locations are never invented: a run record has no line
 * in a Markdown file, and a JSON pointer into the evidence goes in `field`.
 */
import type { Diagnostic, Severity } from "@intentset/core";

export interface EvidenceDiagnosticFields {
  code: string;
  severity?: Severity;
  artifact: string | null;
  path: string | null;
  field?: string;
  message: string;
  remediation: string;
}

export function evidenceDiagnostic(fields: EvidenceDiagnosticFields): Diagnostic {
  return {
    code: fields.code,
    severity: fields.severity ?? "error",
    origin: "evidence",
    artifact: fields.artifact,
    path: fields.path,
    ...(fields.field !== undefined ? { field: fields.field } : {}),
    message: fields.message,
    remediation: fields.remediation,
  };
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** RFC 6901 escaping of one pointer segment. */
export function pointerToken(segment: string | number): string {
  return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}
