/**
 * `intentset validate` (Core §11): the documents in scope through every check
 * the requested level asks for. Diagnostics in `compareDiagnostics` order,
 * then a summary naming the denominator, the level and the scope, then what
 * each level above L1 adds: the architecture summary, coverage, publication
 * readiness. Warnings never fail; errors exit 1. Never writes.
 */
import { count, formatDiagnostic, type Io, json, TOOL } from "../output.ts";
import { levelJson, levelSections } from "../reports.ts";
import type { Session } from "../session.ts";

export function validateCommand(session: Session, asJson: boolean, io: Io): number {
  const { repo, diagnostics, errors, warnings, snapshot, level } = session;
  const artifacts = session.result.graph.artifacts.size;
  if (asJson) {
    io.stdout(
      json({
        tool: TOOL,
        level,
        scope: repo.config.scope,
        commit: snapshot.commit,
        ...(snapshot.commitUnavailable === undefined ? {} : { commitUnavailable: snapshot.commitUnavailable }),
        graphHash: snapshot.graphHash,
        summary: { documents: repo.inputs.length, artifacts, errors, warnings },
        diagnostics,
        ...levelJson(session),
      }),
    );
  } else {
    for (const d of diagnostics) io.stdout(formatDiagnostic(d));
    const lines = [
      `${count(artifacts, "artifact")}, ${count(errors, "error")}, ${count(warnings, "warning")} ` +
        `(level ${level}, scope: ${repo.config.scope.join(", ")})`,
      ...levelSections(session),
    ];
    io.stdout(`${lines.join("\n")}\n`);
  }
  return errors > 0 ? 1 : 0;
}
