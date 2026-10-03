/**
 * `intentset architecture check` (VSA §2, the profile's boundaries): claims,
 * ownership, the import graph, layers, regions, resources, exceptions and,
 * in migration mode, the baseline, over every file the configuration does
 * not ignore. Diagnostics like validate's, then the summary with what was not
 * checked and what is left to review. `--write-baseline` writes the one file
 * it names. Nothing else is written.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeBaseline } from "@intentset/architecture";
import { count, formatDiagnostic, type Io, json, TOOL } from "../output.ts";
import { outputProblem } from "../outputs.ts";
import { architectureLines } from "../reports.ts";
import type { Session } from "../session.ts";

export function architectureCommand(
  session: Session,
  options: { writeBaseline?: string },
  asJson: boolean,
  io: Io,
): number {
  const architecture = session.architecture;
  if (architecture === undefined) throw new Error("architecture check opened a session below L2");
  const diagnostics = architecture.diagnostics;
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  const outside = session.errors - errors;

  if (options.writeBaseline !== undefined) {
    const target = resolve(io.cwd, options.writeBaseline);
    const problem = outputProblem(session.repo, target);
    if (problem !== null) {
      io.stderr(`intentset architecture check: --write-baseline ${options.writeBaseline} ${problem}; not written.\n`);
      return 2;
    }
    const entries = writeBaseline(diagnostics);
    try {
      writeFileSync(target, `${JSON.stringify(entries, null, 2)}\n`);
    } catch (error) {
      io.stderr(
        `intentset architecture check: could not write ${options.writeBaseline}: ${(error as Error).message}\n`,
      );
      return 2;
    }
    io.stderr(
      `intentset architecture check: wrote ${count(entries.length, "baseline entry", "baseline entries")} to ${options.writeBaseline}\n`,
    );
  }

  if (asJson) {
    io.stdout(
      json({
        tool: TOOL,
        level: session.level,
        snapshot: session.snapshot,
        summary: architecture.summary,
        skipped: session.tree?.skipped ?? [],
        errors,
        warnings,
        diagnostics,
        validation: { errorsOutsideArchitecture: outside },
      }),
    );
  } else {
    for (const d of diagnostics) io.stdout(formatDiagnostic(d));
    const lines = [`${count(errors, "error")}, ${count(warnings, "warning")} from the architecture check`];
    if (outside > 0) {
      lines.push(
        `Validation has ${count(outside, "other error")}, so the graph this checked may be incomplete; run \`intentset validate --level ${session.level}\`.`,
      );
    }
    lines.push(...architectureLines(architecture, session.tree?.skipped ?? []));
    io.stdout(`${lines.join("\n")}\n`);
  }
  return session.errors > 0 ? 1 : 0;
}
