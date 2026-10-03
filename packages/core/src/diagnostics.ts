/**
 * One diagnostic shape across every package (ADR 0004, Core §11).
 *
 * `location` is present only when known; a missing location stays missing
 * rather than becoming an invented coordinate. `field` is a JSON pointer into
 * the frontmatter when the problem is a frontmatter value.
 */
export type Severity = "error" | "warning";

export type Origin = "syntax" | "profile" | "graph" | "architecture" | "evidence" | "publication" | "render";

export interface Location {
  /** 1-based line in the file named by `path`. */
  line: number;
  /** 1-based column, when known. */
  column?: number;
}

export interface Diagnostic {
  /** Stable code, e.g. CORE003, VSA005, TS003, AMP001. */
  code: string;
  severity: Severity;
  origin: Origin;
  /** Artifact ID the problem belongs to, or null when the file has no readable ID. */
  artifact: string | null;
  /** Repository-relative POSIX path, or null for a repository-wide problem. */
  path: string | null;
  location?: Location;
  /** JSON pointer into the frontmatter, e.g. "/intentset/links/governedBy/0". */
  field?: string;
  message: string;
  remediation: string;
}

/** ADR 0004: true when any diagnostic is an error; warnings never fail a check. */
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/** Core §11 order: path, artifact ID, code; then line so output is total and deterministic. */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    cmp(a.path ?? "", b.path ?? "") ||
    cmp(a.artifact ?? "", b.artifact ?? "") ||
    cmp(a.code, b.code) ||
    (a.location?.line ?? 0) - (b.location?.line ?? 0) ||
    (a.location?.column ?? 0) - (b.location?.column ?? 0) ||
    cmp(a.field ?? "", b.field ?? "") ||
    cmp(a.message, b.message)
  );
}

/** Core §11 and ADR 0004: a sorted copy, in `compareDiagnostics` order. */
export function sortDiagnostics<T extends Diagnostic>(diagnostics: readonly T[]): T[] {
  return [...diagnostics].sort(compareDiagnostics);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
