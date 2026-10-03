/**
 * Agent context (Core §10): the bounded set of artifacts an engineer or an
 * agent loads before changing implementation, starting from one ID.
 *
 *   behavior    its owning slices (the derived side of `implements`), the
 *               behavior, its rules (`governedBy`), the scenarios that
 *               illustrate it, the verifications over it, its rules and its
 *               scenarios, the owning slices' exposed and consumed contracts,
 *               the decisions informing the behavior, the slices and the
 *               contracts, the knowledge explaining it, and its parent chain
 *   rule        the behaviors it governs, and from each of their bundles the
 *               owning slices and the verifications; also the verifications
 *               and knowledge naming the rule itself, so a rule no behavior
 *               governs yet still shows what checks and explains it
 *   capability  the bundles of its behaviors (children through `parent`,
 *               through sub-capabilities, with a visited set), merged, plus
 *               the knowledge explaining it and its own parent chain
 *   slice       the bundles of the behaviors it implements, merged, plus its
 *               own contracts and the decisions informing it and them
 *   otherwise   the artifact and its direct neighbours, authored and derived
 *
 * Each artifact appears once, under the first role it has in role order, and
 * the bundle is sorted by role then ID. `restricted` artifacts, the start
 * included, are withheld and counted unless asked for, so a short context
 * never reads as a complete one. Only IDs in the graph are followed; an
 * unresolved edge is the validator's to report. Pure and deterministic: the
 * result depends on the graph's artifacts and edges, not on file order.
 */
import { compareStrings } from "./report.ts";
import type { ArtifactType, Graph, LinkKind, Status, Visibility } from "./types.ts";

/** The roles an artifact can have in a bundle, in the order a bundle is sorted by. */
export const CONTEXT_ROLES = [
  "start",
  "owner",
  "behavior",
  "rule",
  "scenario",
  "verification",
  "contract",
  "decision",
  "knowledge",
  "ancestor",
  "neighbour",
] as const;
export type ContextRole = (typeof CONTEXT_ROLES)[number];

export interface ContextArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  status: Status;
  visibility: Visibility;
  /** Repository-relative path of the artifact's file. */
  path: string;
  role: ContextRole;
}

export interface ContextBundle {
  start: string;
  /** Sorted by role order, then ID. Each artifact once, under the first role it has in that order. */
  artifacts: ContextArtifact[];
  /** Restricted artifacts left out because they were not asked for. */
  withheld: number;
}

export interface ContextOptions {
  /** Include `restricted` artifacts instead of withholding them. Default false. */
  includeRestricted?: boolean;
}

const RANK = new Map<ContextRole, number>(CONTEXT_ROLES.map((role, index) => [role, index]));

/** Core §10: the bounded context of an artifact, or null when the graph has no artifact with this ID. */
export function contextFor(graph: Graph, id: string, options: ContextOptions = {}): ContextBundle | null {
  const start = graph.artifacts.get(id);
  if (start === undefined) return null;
  const roles = new Roles(graph);
  roles.add(id, "start");

  switch (start.meta.type) {
    case "behavior":
      behaviorBundle(graph, id, roles);
      break;
    case "rule":
      for (const behavior of into(graph, id, "governedBy", "behavior")) {
        roles.add(behavior, "behavior");
        const bundle = new Roles(graph);
        behaviorBundle(graph, behavior, bundle);
        for (const [member, role] of bundle.entries()) {
          if (role === "owner" || role === "verification") roles.add(member, role);
        }
      }
      for (const verification of into(graph, id, "verifies", "verification")) roles.add(verification, "verification");
      for (const knowledge of into(graph, id, "explains", "knowledge")) roles.add(knowledge, "knowledge");
      break;
    case "capability":
      for (const behavior of behaviorsUnder(graph, id)) behaviorBundle(graph, behavior, roles);
      for (const knowledge of into(graph, id, "explains", "knowledge")) roles.add(knowledge, "knowledge");
      for (const ancestor of ancestors(graph, id)) roles.add(ancestor, "ancestor");
      break;
    case "slice": {
      for (const behavior of from(graph, id, "implements", "behavior")) behaviorBundle(graph, behavior, roles);
      const contracts = [...from(graph, id, "exposes", "contract"), ...from(graph, id, "consumes", "contract")];
      for (const contract of contracts) roles.add(contract, "contract");
      for (const source of [id, ...contracts]) {
        for (const decision of from(graph, source, "informedBy", "decision")) roles.add(decision, "decision");
      }
      break;
    }
    default:
      for (const edge of graph.out.get(id) ?? []) roles.add(edge.to, "neighbour");
      for (const edge of graph.in.get(id) ?? []) roles.add(edge.from, "neighbour");
      break;
  }

  const artifacts: ContextArtifact[] = [];
  let withheld = 0;
  for (const [member, role] of roles.entries()) {
    const artifact = graph.artifacts.get(member);
    if (artifact === undefined) continue;
    const { meta } = artifact;
    if (meta.visibility === "restricted" && options.includeRestricted !== true) {
      withheld++;
      continue;
    }
    artifacts.push({
      id: meta.id,
      type: meta.type,
      title: meta.title,
      status: meta.status,
      visibility: meta.visibility,
      path: artifact.path,
      role,
    });
  }
  artifacts.sort((a, b) => rank(a.role) - rank(b.role) || compareStrings(a.id, b.id));
  return { start: id, artifacts, withheld };
}

/** Role assignment with "first role in role order wins", over IDs that are in the graph. */
class Roles {
  readonly #graph: Graph;
  readonly #roles = new Map<string, ContextRole>();

  constructor(graph: Graph) {
    this.#graph = graph;
  }

  add(id: string, role: ContextRole): void {
    if (!this.#graph.artifacts.has(id)) return;
    const previous = this.#roles.get(id);
    if (previous === undefined || rank(role) < rank(previous)) this.#roles.set(id, role);
  }

  /** Entries sorted by ID, so nothing downstream depends on insertion order. */
  entries(): [string, ContextRole][] {
    return [...this.#roles.entries()].sort((a, b) => compareStrings(a[0], b[0]));
  }
}

function rank(role: ContextRole): number {
  return RANK.get(role) ?? CONTEXT_ROLES.length;
}

/** One behavior's bundle, added into `roles`. */
function behaviorBundle(graph: Graph, behavior: string, roles: Roles): void {
  roles.add(behavior, "behavior");
  const owners = into(graph, behavior, "implements", "slice");
  const rules = from(graph, behavior, "governedBy", "rule");
  const scenarios = into(graph, behavior, "illustrates", "scenario");
  const contracts = owners.flatMap((slice) => [
    ...from(graph, slice, "exposes", "contract"),
    ...from(graph, slice, "consumes", "contract"),
  ]);
  for (const slice of owners) roles.add(slice, "owner");
  for (const rule of rules) roles.add(rule, "rule");
  for (const scenario of scenarios) roles.add(scenario, "scenario");
  for (const claim of [behavior, ...rules, ...scenarios]) {
    for (const verification of into(graph, claim, "verifies", "verification")) roles.add(verification, "verification");
  }
  for (const contract of contracts) roles.add(contract, "contract");
  for (const source of [behavior, ...owners, ...contracts]) {
    for (const decision of from(graph, source, "informedBy", "decision")) roles.add(decision, "decision");
  }
  for (const knowledge of into(graph, behavior, "explains", "knowledge")) roles.add(knowledge, "knowledge");
  for (const ancestor of ancestors(graph, behavior)) roles.add(ancestor, "ancestor");
}

/** Behaviors whose navigation parent is the capability or one of its sub-capabilities, with a visited set. */
function behaviorsUnder(graph: Graph, capability: string): string[] {
  const behaviors = new Set<string>();
  const seen = new Set<string>([capability]);
  const queue = [capability];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of into(graph, current, "parent")) {
      const type = graph.artifacts.get(child)?.meta.type;
      if (type === "behavior") behaviors.add(child);
      else if (type === "capability" && !seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return [...behaviors].sort(compareStrings);
}

/** The navigation parent chain, nearest first, stopping at a cycle or an ID not in the graph. */
function ancestors(graph: Graph, id: string): string[] {
  const chain: string[] = [];
  const visited = new Set<string>([id]);
  let cursor = graph.artifacts.get(id)?.meta.parent;
  while (cursor !== undefined && !visited.has(cursor) && graph.artifacts.has(cursor)) {
    visited.add(cursor);
    chain.push(cursor);
    cursor = graph.artifacts.get(cursor)?.meta.parent;
  }
  return chain;
}

/** Targets of authored edges of one kind leaving `id`, in the graph and of the given type, sorted and unique. */
function from(graph: Graph, id: string, kind: LinkKind, type?: ArtifactType): string[] {
  const ids = (graph.out.get(id) ?? []).filter((edge) => edge.kind === kind).map((edge) => edge.to);
  return typed(graph, ids, type);
}

/** Sources of authored edges of one kind arriving at `id`: the derived side, read from the authored edge. */
function into(graph: Graph, id: string, kind: LinkKind, type?: ArtifactType): string[] {
  const ids = (graph.in.get(id) ?? []).filter((edge) => edge.kind === kind).map((edge) => edge.from);
  return typed(graph, ids, type);
}

function typed(graph: Graph, ids: string[], type: ArtifactType | undefined): string[] {
  const kept = ids.filter((each) => {
    const artifact = graph.artifacts.get(each);
    return artifact !== undefined && (type === undefined || artifact.meta.type === type);
  });
  return [...new Set(kept)].sort(compareStrings);
}
