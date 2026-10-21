/**
 * A diagnostic plus what it is about. Exceptions (VSA §9) match on exact
 * paths and edges, which a message cannot be trusted to carry, so every
 * check reports a Finding: the diagnostic in core's shape (ADR 0004 key
 * order, origin "architecture") and the subject an exception can name.
 */
import type { Diagnostic, Location, Severity } from "@intentset/core";

export interface SubjectEdge {
  /** A file path or a slice ID. */
  from: string;
  /** A file path, a slice ID, or a package specifier. */
  to: string;
}

export interface Finding {
  diagnostic: Diagnostic;
  /** Every path the finding concerns; the diagnostic's own path is always included. */
  paths: string[];
  /** File-level and slice-level edges the finding concerns. */
  edges: SubjectEdge[];
  /** For a finding about one import: what the baseline holds it by, one name at a time (VSA §9). */
  taken?: Taken;
}

/** One import, as a baseline identifies it: how it imports, what it targets and the names it takes. */
export interface Taken {
  /** `import`, `re-export` or `dynamic`. */
  kind: string;
  /** The file it resolves to, or the package specifier. */
  to: string;
  /** `name`, `type name` for a type-only one, `*` for every name; empty for a side-effect import. */
  names: string[];
}

export interface FindingFields {
  code: string;
  severity?: Severity;
  artifact: string | null;
  path: string | null;
  location?: Location;
  field?: string;
  message: string;
  remediation: string;
  paths?: string[];
  edges?: SubjectEdge[];
  taken?: Taken;
}

/** One diagnostic, members in contract order, optional members present only when known. */
export function finding(fields: FindingFields): Finding {
  const diagnostic: Diagnostic = {
    code: fields.code,
    severity: fields.severity ?? "error",
    origin: "architecture",
    artifact: fields.artifact,
    path: fields.path,
    ...(fields.location !== undefined ? { location: fields.location } : {}),
    ...(fields.field !== undefined ? { field: fields.field } : {}),
    message: fields.message,
    remediation: fields.remediation,
  };
  const paths = new Set(fields.paths ?? []);
  if (fields.path !== null) paths.add(fields.path);
  return {
    diagnostic,
    paths: [...paths].sort(),
    edges: fields.edges ?? [],
    ...(fields.taken !== undefined ? { taken: fields.taken } : {}),
  };
}

/** "1 file" / "3 files". */
export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : many}`;
}

/** At most `limit` items joined with commas, then "and N more". */
export function listSome(items: readonly string[], limit = 3): string {
  if (items.length <= limit) return items.join(", ");
  return `${items.slice(0, limit).join(", ")} and ${items.length - limit} more`;
}
