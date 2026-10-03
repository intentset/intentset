/**
 * Construction of diagnostics with one key order (ADR 0004), so two runs that
 * report the same problem produce the same bytes. Optional members are left
 * out rather than set to undefined, which is what keeps `location` honest:
 * absent means unknown, never invented.
 */
import type { Diagnostic, Location, Origin, Severity } from "./diagnostics.ts";

export interface DiagnosticFields {
  code: string;
  severity?: Severity;
  origin: Origin;
  artifact: string | null;
  path: string | null;
  location?: Location;
  field?: string;
  message: string;
  remediation: string;
}

/** ADR 0004: one diagnostic, members in contract order, optional ones present only when known. */
export function makeDiagnostic(fields: DiagnosticFields): Diagnostic {
  const diagnostic: Diagnostic = {
    code: fields.code,
    severity: fields.severity ?? "error",
    origin: fields.origin,
    artifact: fields.artifact,
    path: fields.path,
    message: fields.message,
    remediation: fields.remediation,
  };
  if (fields.location !== undefined) diagnostic.location = fields.location;
  if (fields.field !== undefined) diagnostic.field = fields.field;
  return orderKeys(diagnostic);
}

function orderKeys(d: Diagnostic): Diagnostic {
  const ordered: Diagnostic = {
    code: d.code,
    severity: d.severity,
    origin: d.origin,
    artifact: d.artifact,
    path: d.path,
    ...(d.location !== undefined ? { location: d.location } : {}),
    ...(d.field !== undefined ? { field: d.field } : {}),
    message: d.message,
    remediation: d.remediation,
  };
  return ordered;
}

/** A function from a frontmatter JSON pointer to its file line, when the key exists. */
export type Locate = (pointer: string) => Location | undefined;

export const NO_LOCATION: Locate = () => undefined;

/** ADR 0004 helper: a plain mapping, not an array or null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ADR 0005: code-unit order, the one order everything iterated is sorted by. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** ADR 0004 messages: a type with its indefinite article, "an intent", "a behavior", "a knowledge artifact". */
export function aType(type: string): string {
  const noun = type === "knowledge" ? "knowledge artifact" : type;
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
}

/** ADR 0004 messages: "an intent", or "a behavior, rule or scenario". */
export function describeTypes(types: readonly string[]): string {
  if (types.length === 1) return aType(types[0]);
  const [first, ...rest] = types;
  const last = rest.pop();
  return `${[aType(first), ...rest].join(", ")} or ${last}`;
}

/** ADR 0004 messages: a sentence-initial capital. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
