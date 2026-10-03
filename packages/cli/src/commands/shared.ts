/**
 * What impact and context say before their answer: which snapshot, whether
 * the graph validated, and the CORE003-style refusal for an ID the graph does
 * not hold.
 */
import { type Diagnostic, ID_PATTERN } from "@intentset/core";
import { count } from "../output.ts";
import type { Session } from "../session.ts";

/** The validation state a query ran over, so a reader knows whether the graph was whole. */
export function validationSummary(session: Session, level: string) {
  return {
    level,
    status: session.result.ok ? ("pass" as const) : ("fail" as const),
    artifacts: session.result.graph.artifacts.size,
    errors: session.errors,
    warnings: session.warnings,
  };
}

export function validationLine(session: Session, level: string): string {
  const v = validationSummary(session, level);
  const line = `Validation: ${v.status} at ${level}, ${count(v.artifacts, "artifact")}, ${count(v.errors, "error")}, ${count(v.warnings, "warning")}`;
  return v.status === "pass"
    ? line
    : `${line}. The graph may be incomplete; run \`intentset validate\` and fix the errors first.`;
}

/** Core §5 and §11: an ID that resolves to nothing, reported as CORE003 would report an unresolved link. */
export function unresolved(id: string, session: Session): Diagnostic {
  const scope = session.repo.config.scope.join(", ");
  const malformed = !ID_PATTERN.test(id);
  return {
    code: "CORE003",
    severity: "error",
    origin: "graph",
    artifact: null,
    path: null,
    message: malformed
      ? `${id} is not an artifact ID; IDs are upper case, such as BEH-ASMT-SCHEDULE (Core §4).`
      : `${id} does not resolve to an artifact in this graph (${count(session.result.graph.artifacts.size, "artifact")}, scope: ${scope}).`,
    remediation: malformed
      ? "Give the ID as written in the record's frontmatter; IDs are case-sensitive."
      : "Check the spelling and case, and that the record's file is inside the configured scope.",
  };
}
