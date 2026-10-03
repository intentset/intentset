/**
 * `intentset impact <ID>` (Core §10): what depends on an artifact. Direct
 * dependents apart from candidates further downstream, each with the path
 * that reached it and a reason per step; the start's own rules, contracts and
 * decisions as review context; navigation ancestors. Every report names its
 * snapshot and says that reachability is not proof. Never writes.
 */
import { type ImpactHit, type ImpactReport, impact } from "@intentset/core";
import { formatDiagnostic, type Io, json, snapshotLine, TOOL } from "../output.ts";
import type { Session } from "../session.ts";
import { unresolved, validationLine, validationSummary } from "./shared.ts";

export const REACHABILITY_NOTE =
  "Reachability through authored links marks an artifact for review; it is not proof that runtime behavior changed (Core §10).";

export function impactCommand(session: Session, id: string, level: string, asJson: boolean, io: Io): number {
  const { graph } = session.result;
  const start = graph.artifacts.get(id);
  if (start === undefined) {
    const diagnostic = unresolved(id, session);
    if (asJson) {
      io.stdout(
        json({
          tool: TOOL,
          snapshot: session.snapshot,
          validation: validationSummary(session, level),
          start: null,
          diagnostics: [diagnostic],
        }),
      );
    } else {
      io.stderr(formatDiagnostic(diagnostic));
    }
    return 1;
  }

  const report = impact(graph, id);
  if (asJson) {
    io.stdout(
      json({
        tool: TOOL,
        snapshot: session.snapshot,
        validation: validationSummary(session, level),
        note: REACHABILITY_NOTE,
        start: { id, type: start.meta.type, title: start.meta.title, path: start.path },
        direct: report.direct,
        candidates: report.candidates,
        context: report.context,
        ancestors: report.ancestors,
        diagnostics: [],
      }),
    );
  } else {
    io.stdout(renderImpact(report, session, level, `${start.meta.type} "${start.meta.title}"`));
  }
  return session.result.ok ? 0 : 1;
}

function renderImpact(report: ImpactReport, session: Session, level: string, described: string): string {
  const lines = [
    `Impact of ${report.start}, ${described}`,
    snapshotLine(session.snapshot),
    validationLine(session, level),
    REACHABILITY_NOTE,
    "",
  ];
  const section = (title: string, gloss: string, hits: ImpactHit[]) => {
    lines.push(`${title} (${hits.length}): ${gloss}`);
    if (hits.length === 0) lines.push("  none");
    for (const hit of hits) {
      lines.push(`  ${hit.id}  ${hit.type}  ${hit.title}`);
      lines.push(`    path: ${pathText(report.start, hit)}`);
      lines.push(`    reason: ${hit.path.map((step) => step.reason).join(" ")}`);
    }
    lines.push("");
  };
  section("Direct", "one link from the start", report.direct);
  section("Candidates", "reachable beyond the direct set, for review", report.candidates);
  section("Review context", "the start's own rules, contracts and decisions", report.context);
  lines.push(`Ancestors: ${report.ancestors.length === 0 ? "none" : report.ancestors.join(" > ")}`);
  return `${lines.join("\n")}\n`;
}

/**
 * A hit's path as authored edges, written in the direction they were authored.
 * A reverse step (`kind←`) is an edge from the step to the node before it, so
 * a chain reads from the hit back to the start: `C --dependsOn--> B --implements--> A`.
 * A context step (`kind→`) is an edge from the start to the hit.
 */
export function pathText(start: string, hit: ImpactHit): string {
  const forward = hit.path.length === 1 && hit.path[0].via.endsWith("→");
  if (forward) return `${start} --${hit.path[0].via.slice(0, -1)}--> ${hit.id}`;
  let text = start;
  for (const step of hit.path) text = `${step.id} --${step.via.slice(0, -1)}--> ${text}`;
  return text;
}
