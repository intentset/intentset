/**
 * Impact traversal (Core §10). From a starting ID, the artifacts one
 * derived edge away are direct; everything reachable beyond them by further
 * reverse traversal, with a visited set, is a candidate; the start's own
 * rules, contracts and decisions are review context; navigation ancestors
 * come through `parent`. Each hit carries the path that reached it, with a
 * reason sentence per step. Reachability is recorded, never asserted as
 * proof that runtime behavior changed.
 */
import { compareStrings } from "./report.ts";
import type { Edge, Graph, ImpactHit, ImpactReport, ImpactStep, LinkKind } from "./types.ts";

const PHRASES: Record<LinkKind, string> = {
  parent: "has {to} as its navigation parent",
  governedBy: "is governed by {to}",
  illustrates: "illustrates {to}",
  implements: "implements {to}",
  dependsOn: "depends on {to}",
  exposes: "exposes {to}",
  consumes: "consumes {to}",
  verifies: "verifies {to}",
  explains: "explains {to}",
  informedBy: "is informed by {to}",
  requires: "requires {to}",
  supports: "supports {to}",
  replacedBy: "is replaced by {to}",
};

const CONTEXT_KINDS: readonly LinkKind[] = ["governedBy", "exposes", "consumes", "informedBy"];

/** Core §10: the reason recorded for one step, a sentence read from the authored edge's source. */
export function reasonFor(edge: Edge): string {
  return `${edge.from} ${PHRASES[edge.kind].replace("{to}", edge.to)}.`;
}

/** Core §10: the impact report for an artifact. An ID not in the graph yields an empty report. */
export function impact(graph: Graph, id: string): ImpactReport {
  const report: ImpactReport = { start: id, direct: [], candidates: [], context: [], ancestors: [] };
  if (!graph.artifacts.has(id)) return report;

  const paths = new Map<string, ImpactStep[]>();
  const queue: string[] = [id];
  paths.set(id, []);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const sofar = paths.get(current) as ImpactStep[];
    const arriving = [...(graph.in.get(current) ?? [])].sort(
      (a, b) => compareStrings(a.from, b.from) || compareStrings(a.kind, b.kind),
    );
    for (const edge of arriving) {
      if (paths.has(edge.from)) continue;
      paths.set(edge.from, [...sofar, { id: edge.from, via: `${edge.kind}←`, reason: reasonFor(edge) }]);
      queue.push(edge.from);
    }
  }
  for (const hitId of [...paths.keys()].sort(compareStrings)) {
    if (hitId === id) continue;
    const path = paths.get(hitId) as ImpactStep[];
    const hit = toHit(graph, hitId, path);
    if (hit === null) continue;
    if (path.length === 1) report.direct.push(hit);
    else report.candidates.push(hit);
  }

  const contextEdges = (graph.out.get(id) ?? [])
    .filter((edge) => CONTEXT_KINDS.includes(edge.kind) && graph.artifacts.has(edge.to))
    .sort((a, b) => compareStrings(a.to, b.to) || compareStrings(a.kind, b.kind));
  const seenContext = new Set<string>();
  for (const edge of contextEdges) {
    if (seenContext.has(edge.to)) continue;
    seenContext.add(edge.to);
    const hit = toHit(graph, edge.to, [{ id: edge.to, via: `${edge.kind}→`, reason: reasonFor(edge) }]);
    if (hit !== null) report.context.push(hit);
  }

  const visited = new Set<string>([id]);
  let cursor = graph.artifacts.get(id)?.meta.parent;
  while (cursor !== undefined && !visited.has(cursor) && graph.artifacts.has(cursor)) {
    visited.add(cursor);
    report.ancestors.push(cursor);
    cursor = graph.artifacts.get(cursor)?.meta.parent;
  }
  return report;
}

function toHit(graph: Graph, id: string, path: ImpactStep[]): ImpactHit | null {
  const artifact = graph.artifacts.get(id);
  if (artifact === undefined) return null;
  return { id, type: artifact.meta.type, title: artifact.meta.title, path };
}
