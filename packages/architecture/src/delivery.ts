/**
 * VSA §3, ADR 0017: whether a slice's missing paths may be planned. A draft slice's claim that matches no file
 * (VSA009) and entrypoint that is not a file (VSA002) are warnings, because its paths may not be written yet. A draft
 * slice whose effective delivery is `built`, or that implements a behavior whose effective delivery is `built`,
 * describes code that exists, so it has no planned paths and both are errors.
 */
import { type Artifact, deliveryOf, type Graph } from "@intentset/core";
import { compareStrings } from "./patterns.ts";

/** Null when the slice's missing paths are errors for its status alone; otherwise whether they may be planned, and why not. */
export function pathsMayBePlanned(slice: Artifact, graph: Graph): { planned: boolean; built: string | null } {
  if (slice.meta.status !== "draft") return { planned: false, built: null };
  if (deliveryOf(slice.meta) === "built") return { planned: false, built: `${slice.meta.id} says its work is built` };
  const behavior = (slice.meta.links.implements ?? [])
    .filter((id) => {
      const target = graph.artifacts.get(id);
      return target?.meta.type === "behavior" && deliveryOf(target.meta) === "built";
    })
    .sort(compareStrings)[0];
  if (behavior !== undefined) {
    return { planned: false, built: `${slice.meta.id} implements ${behavior}, whose work is built` };
  }
  return { planned: true, built: null };
}
