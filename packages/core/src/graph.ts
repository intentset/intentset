/**
 * The typed graph (Core §5, §12): authored edges in the direction they are
 * written, and one derived inverse per authored edge, marked derived.
 */
import { type Artifact, type Edge, type Graph, LINK_KINDS } from "./types.ts";

/**
 * Core §5 and §12: build the graph from artifacts whose IDs are already
 * unique. Edges follow document order (the order given) then field order
 * (`parent`, then the Core §5 table). Edges to IDs that are not in the graph
 * are kept as authored; the validator reports them.
 */
export function buildGraph(artifacts: readonly Artifact[]): Graph {
  const map = new Map<string, Artifact>();
  const edges: Edge[] = [];
  for (const artifact of artifacts) {
    const { meta } = artifact;
    map.set(meta.id, artifact);
    if (meta.parent !== undefined) edges.push({ kind: "parent", from: meta.id, to: meta.parent, derived: false });
    for (const kind of LINK_KINDS) {
      if (kind === "parent") continue;
      for (const to of meta.links[kind] ?? []) edges.push({ kind, from: meta.id, to, derived: false });
    }
  }
  const derived: Edge[] = edges.map((edge) => ({ kind: edge.kind, from: edge.to, to: edge.from, derived: true }));
  const out = new Map<string, Edge[]>();
  const incoming = new Map<string, Edge[]>();
  for (const edge of edges) {
    push(out, edge.from, edge);
    push(incoming, edge.to, edge);
  }
  return { artifacts: map, edges, derived, out, in: incoming };
}

function push(map: Map<string, Edge[]>, key: string, edge: Edge): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [edge]);
  else list.push(edge);
}

/** Core §5: authored edges of one kind leaving an artifact. */
export function outgoing(graph: Graph, id: string, kind: Edge["kind"]): Edge[] {
  return (graph.out.get(id) ?? []).filter((edge) => edge.kind === kind);
}

/** Core §5: authored edges of one kind arriving at an artifact, the authored side of a derived inverse. */
export function incomingEdges(graph: Graph, id: string, kind: Edge["kind"]): Edge[] {
  return (graph.in.get(id) ?? []).filter((edge) => edge.kind === kind);
}
