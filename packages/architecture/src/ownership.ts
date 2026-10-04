/**
 * Behavior ownership and contract surfaces (VSA001, VSA002; Core §5).
 *
 * VSA001 at L2 and above: an approved, implemented, released or deprecated
 * behavior has exactly one incoming `implements` from a product slice. Core
 * reports the same condition as CORE006 from the graph alone; VSA001 is the
 * architecture's own statement of it, so a VSA report stands by itself.
 *
 * VSA002: each of a slice's entrypoints is a file in the repository and lies
 * inside one of the slice's own source claims, and no two lie in the same
 * package (the nearest directory above holding a package.json, or the
 * repository root): a slice has one public surface per package it spans. An
 * empty entrypoint module is allowed for a leaf. While the slice is draft, an
 * entrypoint that is not a file yet is a warning: planned, not yet owned
 * (VSA §3).
 *
 * VSA012 (deleting or splitting a slice dispositions its behavior, paths and
 * contracts) is a diff between two snapshots. This check sees one snapshot,
 * so it emits nothing for VSA012; what a deletion leaves behind still shows
 * here as VSA001 for the orphaned behavior and VSA009 or AMP004 for the
 * orphaned files.
 */
import type { Artifact, Graph, Level } from "@intentset/core";
import { LEVELS } from "@intentset/core";
import { type Finding, finding } from "./finding.ts";
import { compareStrings, matchPattern, validatePattern } from "./patterns.ts";
import { describePackage, type Model } from "./regions.ts";

const OWNED_STATUSES = new Set(["approved", "implemented", "released", "deprecated"]);

export function checkOwnership(model: Model, graph: Graph, level: Level): Finding[] {
  const findings: Finding[] = [];

  if (LEVELS.indexOf(level) >= LEVELS.indexOf("L2")) {
    const behaviors = [...graph.artifacts.values()]
      .filter((artifact) => artifact.meta.type === "behavior" && OWNED_STATUSES.has(artifact.meta.status))
      .sort((a, b) => compareStrings(a.meta.id, b.meta.id));
    for (const behavior of behaviors) {
      const id = behavior.meta.id;
      const owners = (graph.in.get(id) ?? [])
        .filter((edge) => edge.kind === "implements")
        .map((edge) => graph.artifacts.get(edge.from))
        .filter((slice): slice is Artifact => slice?.meta.slice?.kind === "product")
        .map((slice) => slice.meta.id)
        .sort(compareStrings);
      const unique = [...new Set(owners)];
      if (unique.length === 1) continue;
      findings.push(
        finding({
          code: "VSA001",
          artifact: id,
          path: behavior.path,
          message:
            unique.length === 0
              ? `Behavior ${id} is ${behavior.meta.status} and no product slice implements it.`
              : `Behavior ${id} is ${behavior.meta.status} and ${unique.length} product slices implement it: ${unique.join(", ")}.`,
          remediation:
            unique.length === 0
              ? "Add it to the implements of the one product slice accountable for it, or retire it with replacedBy (VSA001)."
              : "Keep implements on the one accountable slice and express the others through dependsOn and contracts (VSA001).",
          paths: unique.map((owner) => graph.artifacts.get(owner)!.path),
          edges: unique.map((owner) => ({ from: owner, to: id })),
        }),
      );
    }
  }

  for (const slice of model.slices) {
    // The first entrypoint seen in each package; a second in the same package is reported against it.
    const byPackage = new Map<string, string>();
    slice.meta.entrypoints.forEach((entrypoint, i) => {
      const field = `/intentset/slice/entrypoints/${i}`;
      if (entrypoint === "" || validatePattern(entrypoint) !== null || entrypoint.includes("*")) {
        findings.push(
          finding({
            code: "VSA002",
            artifact: slice.id,
            path: slice.path,
            field,
            message: `${slice.id} declares the entrypoint "${entrypoint}", which is not one repository-relative file path.`,
            remediation:
              "Name the file that is the slice's public contract surface in its package, such as its index.ts (VSA002, TS001).",
          }),
        );
        return;
      }
      const pkg = model.packageOf(entrypoint);
      const first = byPackage.get(pkg);
      if (first !== undefined) {
        findings.push(
          finding({
            code: "VSA002",
            artifact: slice.id,
            path: slice.path,
            field,
            message: `${slice.id} declares two entrypoints in ${describePackage(pkg)}, ${first} and ${entrypoint}; a slice has one public surface per package it spans.`,
            remediation: `Export what ${entrypoint} offers from ${first} and remove it from entrypoints, or move it into the package it serves (VSA002).`,
            paths: [first, entrypoint],
          }),
        );
      } else byPackage.set(pkg, entrypoint);
      if (!model.files.has(entrypoint)) {
        const planned = slice.artifact.meta.status === "draft";
        findings.push(
          finding({
            code: "VSA002",
            ...(planned ? { severity: "warning" as const } : {}),
            artifact: slice.id,
            path: slice.path,
            field,
            message: planned
              ? `The entrypoint ${entrypoint} of draft slice ${slice.id} is not a file yet; it is planned, and an error once the slice leaves draft.`
              : `The entrypoint ${entrypoint} of ${slice.id} is not a file in the repository.`,
            remediation: "Create the entrypoint, empty if the slice exposes nothing yet, or correct the path (VSA002).",
            paths: [entrypoint],
          }),
        );
        return;
      }
      const owned = slice.meta.claims.some(
        (claim, k) =>
          claim.kind === "source" && !slice.invalidClaims.includes(k) && matchPattern(claim.path, entrypoint),
      );
      if (!owned) {
        findings.push(
          finding({
            code: "VSA002",
            artifact: slice.id,
            path: slice.path,
            field,
            message: `The entrypoint ${entrypoint} of ${slice.id} lies outside every source claim of the slice.`,
            remediation: "Move the entrypoint into the slice's source claim, or extend the claim to cover it (VSA002).",
            paths: [entrypoint],
          }),
        );
      }
    });
  }

  return findings;
}
