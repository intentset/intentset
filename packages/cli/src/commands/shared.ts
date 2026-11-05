/**
 * What impact and context say before their answer: which snapshot, whether
 * the graph validated, and the CORE003-style refusal for an ID the graph does
 * not hold.
 */
import type { TypeScriptMissingError } from "@intentset/architecture";
import { type Diagnostic, ID_PATTERN } from "@intentset/core";
import { count } from "../output.ts";
import type { Session } from "../session.ts";

/**
 * What the CLI says when a check needed TypeScript 7's scanner and the `typescript` the repository gave
 * @intentset/architecture is older or absent: the version found and the command that runs the toolchain with its
 * own TypeScript, for the arguments that were given, with pnpm (which resolves the peer to the repository's own
 * copy) and with npm (which installs the peer beside the CLI, so it rarely gets here).
 */
export function typescriptMissing(error: TypeScriptMissingError, argv: readonly string[]): string {
  const args = argv.length === 0 ? "" : ` ${argv.join(" ")}`;
  const found =
    error.found === null
      ? "no `typescript` resolves from @intentset/architecture"
      : `the \`typescript\` this repository gives @intentset/architecture is ${error.found}`;
  return (
    `intentset: the architecture check needs TypeScript 7, and ${found}. Run the toolchain without installing it, ` +
    `as \`pnpm dlx --package=@intentset/cli --package=typescript@7 intentset${args}\`, or with npm as ` +
    `\`npx -p @intentset/cli -p typescript@7 intentset${args}\`; or give the repository TypeScript 7.`
  );
}

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
