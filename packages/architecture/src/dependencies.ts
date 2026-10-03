/**
 * Declared against observed dependencies (VSA004) and cycles (VSA005).
 *
 * VSA004: an observed import from one slice into another that the importer
 * does not list in `dependsOn`, one finding per pair of slices at the first
 * import; a consumed contract that no slice exposes, or that more than one
 * exposes; a consumed contract whose one exposing slice is not depended on.
 *
 * VSA005: strongly connected components (Tarjan) over the union of observed
 * slice edges and declared `dependsOn` edges, type-only imports included
 * (profile §3: they still count for cycles). One finding per component of
 * two or more slices, naming them along one concrete cycle.
 */
import type { Graph } from "@intentset/core";
import type { SliceEdge } from "./boundaries.ts";
import { type Finding, finding, plural } from "./finding.ts";
import { compareStrings } from "./patterns.ts";
import type { Model } from "./regions.ts";

export function checkDependencies(
  model: Model,
  graph: Graph,
  sliceEdges: ReadonlyMap<string, SliceEdge>,
): { findings: Finding[]; cycles: number } {
  const findings: Finding[] = [];

  for (const key of [...sliceEdges.keys()].sort(compareStrings)) {
    const { from, to, imports } = sliceEdges.get(key)!;
    const importer = model.sliceById.get(from)!;
    if (importer.dependsOn.includes(to)) continue;
    const first = imports[0];
    findings.push(
      finding({
        code: "VSA004",
        artifact: from,
        path: first.from,
        location: { line: first.line },
        message: `${from} imports ${to} (${plural(imports.length, "import")}, the first here) but does not declare ${to} in dependsOn.`,
        remediation: `Add ${to} to links.dependsOn in ${importer.path}, or remove the import (VSA004).`,
        paths: [...new Set(imports.map((edge) => edge.from)), importer.path],
        edges: [{ from, to }, ...imports.map((edge) => ({ from: edge.from, to: edge.to as string }))],
      }),
    );
  }

  const exposers = new Map<string, string[]>();
  for (const slice of model.slices) {
    for (const contract of slice.exposes) {
      const list = exposers.get(contract) ?? [];
      list.push(slice.id);
      exposers.set(contract, list);
    }
  }
  for (const slice of model.slices) {
    const consumes = slice.artifact.meta.links.consumes ?? [];
    consumes.forEach((contract, i) => {
      const field = `/intentset/links/consumes/${i}`;
      const owners = (exposers.get(contract) ?? []).sort(compareStrings);
      const base = { artifact: slice.id, path: slice.path, field, edges: [{ from: slice.id, to: contract }] };
      if (owners.length === 0) {
        if (graph.artifacts.get(contract)?.meta.type !== "contract") return; // An unresolved reference is core's CORE003.
        findings.push(
          finding({
            ...base,
            code: "VSA004",
            message: `${slice.id} consumes ${contract}, which no slice exposes.`,
            remediation: `Add ${contract} to the exposes of the slice that maintains it, or stop consuming it (VSA004).`,
          }),
        );
      } else if (owners.length > 1) {
        findings.push(
          finding({
            ...base,
            code: "VSA004",
            message: `${slice.id} consumes ${contract}, which ${owners.length} slices expose: ${owners.join(", ")}.`,
            remediation: `Keep ${contract} in the exposes of the one slice that maintains it (VSA004).`,
          }),
        );
      } else if (owners[0] !== slice.id && !slice.dependsOn.includes(owners[0])) {
        findings.push(
          finding({
            ...base,
            code: "VSA004",
            message: `${slice.id} consumes ${contract}, exposed by ${owners[0]}, but does not declare ${owners[0]} in dependsOn.`,
            remediation: `Add ${owners[0]} to links.dependsOn of ${slice.id}; a consumer lists both consumes and dependsOn (VSA §4).`,
          }),
        );
      }
    });
  }

  // Cycles over observed and declared slice edges.
  const nodes = model.slices.map((slice) => slice.id);
  const adjacency = new Map<string, Set<string>>(nodes.map((id) => [id, new Set<string>()]));
  const declared = new Set<string>();
  for (const slice of model.slices) {
    for (const target of slice.dependsOn) {
      if (!adjacency.has(target) || target === slice.id) continue;
      adjacency.get(slice.id)!.add(target);
      declared.add(`${slice.id}->${target}`);
    }
  }
  for (const { from, to } of sliceEdges.values()) adjacency.get(from)?.add(to);
  const successors = new Map([...adjacency].map(([id, set]) => [id, [...set].sort(compareStrings)]));
  const components = stronglyConnected(nodes, successors).filter((component) => component.length > 1);
  for (const component of components) {
    const members = new Set(component);
    const cycle = shortestCycle(component[0], successors, members);
    const internal: { from: string; to: string }[] = [];
    let observed = 0;
    let written = 0;
    for (const from of component) {
      for (const to of successors.get(from) ?? []) {
        if (!members.has(to)) continue;
        internal.push({ from, to });
        if (sliceEdges.has(`${from}->${to}`)) observed++;
        if (declared.has(`${from}->${to}`)) written++;
      }
    }
    const first = model.sliceById.get(component[0])!;
    findings.push(
      finding({
        code: "VSA005",
        artifact: first.id,
        path: first.path,
        message: `Slices ${component.join(", ")} form a compile-time dependency cycle, ${cycle.join(" -> ")}, from ${plural(observed, "observed import edge")} and ${plural(written, "declared dependsOn edge")}.`,
        remediation:
          "Break the cycle: move the shared rule to one owner's contract, invert one dependency, or decouple it through an event contract (VSA005).",
        paths: component.map((id) => model.sliceById.get(id)!.path),
        edges: internal,
      }),
    );
  }

  return { findings, cycles: components.length };
}

/**
 * Tarjan's strongly connected components. Nodes and successors are visited in
 * sorted order and each component comes back sorted, components ordered by
 * their first member, so the output is the same for the same graph.
 */
export function stronglyConnected(
  nodes: readonly string[],
  successors: ReadonlyMap<string, readonly string[]>,
): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter++;
    stack.push(node);
    onStack.add(node);
    for (const next of successors.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component.sort(compareStrings));
    }
  };

  for (const node of [...nodes].sort(compareStrings)) if (!index.has(node)) visit(node);
  return components.sort((a, b) => compareStrings(a[0], b[0]));
}

/** The shortest cycle through `start` inside the component, as a closed path: A -> B -> A. */
export function shortestCycle(
  start: string,
  successors: ReadonlyMap<string, readonly string[]>,
  members: ReadonlySet<string>,
): string[] {
  const previous = new Map<string, string>();
  const queue: string[] = [start];
  const seen = new Set<string>([start]);
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of successors.get(node) ?? []) {
      if (!members.has(next)) continue;
      if (next === start) {
        const path = [start];
        for (let at: string | undefined = node; at !== undefined && at !== start; at = previous.get(at))
          path.splice(1, 0, at);
        path.push(start);
        return path;
      }
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, node);
      queue.push(next);
    }
  }
  return [start];
}
