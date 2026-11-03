/**
 * A generated model of a few thousand records for the Atlas's tests of its overview chart and its map, so a defect that
 * only a large model shows (labels that overlap, a chart that squeezes its rows) is caught here. Long, similar IDs on
 * purpose: a capability's ID shares its first twenty-odd characters with the next one's.
 */
import { graphHash } from "@intentset/core";
import type { AtlasInput } from "../src/index.ts";

export interface LargeModel {
  input: AtlasInput;
  capabilities: string[];
  records: number;
}

/** `capabilities` capabilities, each with `perCapability` behaviors; each behavior has a rule, a scenario and a check. */
export function largeModel(capabilities: number, perCapability: number): LargeModel {
  const artifacts = new Map<string, unknown>();
  const edges: { kind: string; from: string; to: string }[] = [];
  const add = (id: string, type: string, parent?: string) =>
    artifacts.set(id, {
      meta: {
        id,
        type,
        title: `${type} ${id}`,
        status: "draft",
        owner: "maintainers",
        spec: "0.2",
        profile: "intentset/x/0.2",
        links: {},
        audiences: [],
        visibility: "internal",
        ...(parent === undefined ? {} : { parent }),
      },
      path: `product/${id}.md`,
      sourceHash: "0".repeat(64),
      headings: [],
      foreign: {},
      body: `# ${id}\n\nA generated record.\n`,
    });
  const caps: string[] = [];
  for (let c = 0; c < capabilities; c++) {
    const cap = `CAP-CONTENT-GENERATION-AREA-${String(c).padStart(3, "0")}`;
    caps.push(cap);
    add(cap, "capability");
    const slice = `SLICE-CONTENT-GENERATION-AREA-${String(c).padStart(3, "0")}`;
    add(slice, "slice");
    for (let b = 0; b < perCapability; b++) {
      const suffix = `${String(c).padStart(3, "0")}-${String(b).padStart(3, "0")}`;
      const behavior = `BEH-CONTENT-GENERATION-AREA-${suffix}`;
      add(behavior, "behavior", cap);
      edges.push({ kind: "parent", from: behavior, to: cap });
      edges.push({ kind: "implements", from: slice, to: behavior });
      const rule = `RULE-CONTENT-GENERATION-AREA-${suffix}`;
      add(rule, "rule");
      edges.push({ kind: "governedBy", from: behavior, to: rule });
      const scenario = `SCN-CONTENT-GENERATION-AREA-${suffix}`;
      add(scenario, "scenario");
      edges.push({ kind: "illustrates", from: scenario, to: behavior });
      // Every other behavior is named by a check, so the chart's two series differ.
      if (b % 2 === 0) {
        const check = `TEST-CONTENT-GENERATION-AREA-${suffix}`;
        add(check, "verification");
        edges.push({ kind: "verifies", from: check, to: behavior });
      }
    }
  }
  const out = new Map<string, typeof edges>();
  const into = new Map<string, typeof edges>();
  for (const edge of edges) {
    out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
    into.set(edge.to, [...(into.get(edge.to) ?? []), edge]);
  }
  const graph = { artifacts, edges, derived: [], out, in: into };
  const input = {
    graph,
    registries: { resources: [] },
    diagnostics: [],
    snapshot: { commit: null, graphHash: graphHash(graph as never), scope: [], level: "L1" },
    evidence: null,
  } as unknown as AtlasInput;
  return { input, capabilities: caps, records: artifacts.size };
}
