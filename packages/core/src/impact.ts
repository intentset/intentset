/**
 * Impact traversal (Core §10). From a starting ID, the artifacts one
 * derived edge away are direct; everything reachable beyond them by further
 * reverse traversal, with a visited set, is a candidate; the start's own
 * rules, contracts and decisions are review context; navigation ancestors
 * come through `parent`. Each hit carries the path that reached it, with a
 * reason sentence per step. Reachability is recorded, never asserted as
 * proof that runtime behavior changed.
 */
import { graphHash } from "./hash.ts";
import { compareStrings } from "./report.ts";
import type {
  Edge,
  ExportImpactHit,
  Graph,
  ImpactHit,
  ImpactReport,
  ImpactReportSection,
  ImpactStep,
  LinkKind,
} from "./types.ts";

/** Said beside every impact report, because reachability is easy to read as more than it is (Core §10). */
export const IMPACT_NOTE =
  "Reachability through authored links marks an artifact for review; it is not proof that runtime behavior changed (Core §10).";

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

/**
 * `reports.impact` for the export (spec/export.md §4.3): the impact report from
 * every artifact in the graph, or from `starts` when given, with each hit
 * reduced to its ID and path. A consumer joins hits to `artifacts` by ID.
 */
export function impactReport(graph: Graph, starts?: Iterable<string>): ImpactReportSection {
  const ids = [...new Set(starts ?? graph.artifacts.keys())]
    .filter((id) => graph.artifacts.has(id))
    .sort(compareStrings);
  const hit = (h: ImpactHit): ExportImpactHit => ({ id: h.id, path: h.path });
  return {
    graphHash: graphHash(graph),
    note: IMPACT_NOTE,
    starts: ids.map((id) => {
      const report = impact(graph, id);
      return {
        start: id,
        direct: report.direct.map(hit),
        candidates: report.candidates.map(hit),
        context: report.context.map(hit),
        ancestors: report.ancestors,
        withheld: 0,
      };
    }),
  };
}
