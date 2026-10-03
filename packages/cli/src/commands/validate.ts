/**
 * `intentset validate` (Core §11): the documents in scope through the whole
 * pipeline at the requested level. Diagnostics in `compareDiagnostics` order,
 * then a summary naming the denominator, the level and the scope. Warnings
 * never fail; errors exit 1. Never writes.
 */
import type { Level } from "@intentset/core";
import { count, formatDiagnostic, type Io, json, TOOL } from "../output.ts";
import type { Session } from "../session.ts";

export function validateCommand(session: Session, level: Level, asJson: boolean, io: Io): number {
  const { repo, diagnostics, errors, warnings, snapshot } = session;
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
      }),
    );
  } else {
    for (const d of diagnostics) io.stdout(formatDiagnostic(d));
    io.stdout(
      `${count(artifacts, "artifact")}, ${count(errors, "error")}, ${count(warnings, "warning")} ` +
        `(level ${level}, scope: ${repo.config.scope.join(", ")})\n`,
    );
  }
  return errors > 0 ? 1 : 0;
}
