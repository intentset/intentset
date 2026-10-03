/**
 * Path and resource ownership (VSA §3, §7; VSA009; profile AMP004).
 *
 * - A nonempty claim that matches no file is VSA009.
 * - Two slices resolving one file is VSA009, once per pair of claims, naming
 *   both slices, both claims and the files.
 * - A file claimed by a slice and recorded as a registry resource has two
 *   owners, which is VSA009 too: a shared resource has one recorded owner.
 * - A registry resource path that matches no file, or names a consumer that
 *   is no slice, is VSA009; consumers and `usesResources` that disagree are
 *   a VSA009 warning, since the registry restates what the slices declare.
 * - A code file under a backend root owned by no slice and no resource is
 *   AMP004; one under a source root owned by nothing is VSA009. Both only
 *   inside the declared scope.
 *
 * A resource that a slice uses but the registry does not declare is core's
 * CORE003, and an invalid claim pattern core already rejects is CORE001;
 * neither is repeated here.
 */
import { type Graph, patternProblem } from "@intentset/core";
import { type Finding, finding, listSome, plural } from "./finding.ts";
import { isCode } from "./paths.ts";
import { compareStrings, validatePattern } from "./patterns.ts";
import type { Model } from "./regions.ts";

export function checkClaims(model: Model, graph: Graph, registriesPath: string): Finding[] {
  const findings: Finding[] = [];

  for (const slice of model.slices) {
    slice.meta.claims.forEach((claim, i) => {
      const field = `/intentset/slice/claims/${i}/path`;
      const why = validatePattern(claim.path);
      if (why !== null) {
        if (patternProblem(claim.path) === null) {
          findings.push(
            finding({
              code: "VSA009",
              artifact: slice.id,
              path: slice.path,
              field,
              message: `Claim ${i} of ${slice.id}, ${claim.path}, ${why}, so it resolves to no file.`,
              remediation: "Use literal segments, `*` within a segment and `**` standing alone as a segment (VSA §3).",
            }),
          );
        }
        return;
      }
      if (slice.claimFiles[i].length === 0) {
        findings.push(
          finding({
            code: "VSA009",
            artifact: slice.id,
            path: slice.path,
            field,
            message: `The ${claim.kind} claim ${claim.path} of ${slice.id} matches no file in the repository.`,
            remediation:
              "Correct the path, add the files it promises, or remove the claim; an empty claim is not ownership (VSA §3).",
          }),
        );
      }
    });
  }

  // Two slices, one file: one finding per pair of claims.
  const pairs = new Map<
    string,
    { a: { slice: string; claim: number }; b: { slice: string; claim: number }; files: string[] }
  >();
  for (const [file, owners] of [...model.claimOwners].sort(([x], [y]) => compareStrings(x, y))) {
    for (let x = 0; x < owners.length; x++) {
      for (let y = x + 1; y < owners.length; y++) {
        if (owners[x].slice === owners[y].slice) continue;
        const [a, b] = [owners[x], owners[y]].sort((p, q) => compareStrings(p.slice, q.slice) || p.claim - q.claim);
        const key = `${a.slice}#${a.claim}|${b.slice}#${b.claim}`;
        const entry = pairs.get(key) ?? { a, b, files: [] };
        entry.files.push(file);
        pairs.set(key, entry);
      }
    }
  }
  for (const key of [...pairs.keys()].sort(compareStrings)) {
    const { a, b, files } = pairs.get(key)!;
    const sliceA = model.sliceById.get(a.slice)!;
    const sliceB = model.sliceById.get(b.slice)!;
    const claimA = sliceA.meta.claims[a.claim].path;
    const claimB = sliceB.meta.claims[b.claim].path;
    findings.push(
      finding({
        code: "VSA009",
        artifact: a.slice,
        path: files[0],
        message: `${a.slice} (claim ${claimA}) and ${b.slice} (claim ${claimB}) both resolve ${plural(files.length, "file")}: ${listSome(files)}.`,
        remediation: `Narrow one claim so each file has one owner, or extract the shared code into a contract or a technical owner (VSA §3).`,
        paths: [...files, sliceA.path, sliceB.path],
        edges: [{ from: a.slice, to: b.slice }],
      }),
    );
  }

  // A resource has one recorded owner; a slice claiming its file is a second.
  for (const info of model.resources) {
    const { resource, index, files } = info;
    const field = `/resources/${index}/path`;
    const why = validatePattern(resource.path);
    if (why !== null) {
      findings.push(
        finding({
          code: "VSA009",
          artifact: null,
          path: registriesPath,
          field,
          message: `Resource ${resource.id} has the path ${resource.path}, which ${why}.`,
          remediation: "Give the repository-relative path or pattern of the files that define the resource (VSA §3).",
        }),
      );
      continue;
    }
    if (files.length === 0) {
      findings.push(
        finding({
          code: "VSA009",
          artifact: null,
          path: registriesPath,
          field,
          message: `Resource ${resource.id} records the path ${resource.path}, which matches no file in the repository.`,
          remediation: "Correct the path to the file that defines the resource, or remove the record (VSA §7).",
        }),
      );
    }
    const claimedBy = new Map<string, string[]>();
    for (const file of files) {
      for (const owner of model.claimOwners.get(file) ?? []) {
        const list = claimedBy.get(owner.slice) ?? [];
        if (!list.includes(file)) list.push(file);
        claimedBy.set(owner.slice, list);
      }
    }
    for (const sliceId of [...claimedBy.keys()].sort(compareStrings)) {
      const claimed = claimedBy.get(sliceId)!;
      findings.push(
        finding({
          code: "VSA009",
          artifact: sliceId,
          path: claimed[0],
          message: `${listSome(claimed)} ${claimed.length === 1 ? "is" : "are"} recorded as resource ${resource.id}, owned by ${resource.owner}, and also claimed by ${sliceId}.`,
          remediation: `Keep the resource's one recorded owner and have ${sliceId} list ${resource.id} in usesResources instead of claiming its file (VSA §7, profile §6).`,
          paths: [...claimed, model.sliceById.get(sliceId)!.path],
          edges: [{ from: sliceId, to: resource.id }],
        }),
      );
    }

    resource.consumers.forEach((consumer, k) => {
      const artifact = graph.artifacts.get(consumer);
      if (artifact === undefined || artifact.meta.type !== "slice") {
        findings.push(
          finding({
            code: "VSA009",
            artifact: null,
            path: registriesPath,
            field: `/resources/${index}/consumers/${k}`,
            message: `Resource ${resource.id} lists the consumer ${consumer}, which is not a slice in the graph.`,
            remediation: "List the IDs of the slices that use the resource, as they appear in their usesResources.",
          }),
        );
      } else if (!(artifact.meta.slice?.usesResources ?? []).includes(resource.id)) {
        findings.push(
          finding({
            code: "VSA009",
            severity: "warning",
            artifact: consumer,
            path: registriesPath,
            field: `/resources/${index}/consumers/${k}`,
            message: `Resource ${resource.id} lists ${consumer} as a consumer, but ${consumer} does not list it in usesResources.`,
            remediation: `Add ${resource.id} to the usesResources of ${consumer}, or remove ${consumer} from the resource's consumers.`,
          }),
        );
      }
    });
  }
  const resourceById = new Map(model.resources.map((info) => [info.resource.id, info.resource]));
  for (const slice of model.slices) {
    slice.meta.usesResources.forEach((id, k) => {
      const resource = resourceById.get(id);
      if (resource === undefined || resource.consumers.includes(slice.id)) return;
      findings.push(
        finding({
          code: "VSA009",
          severity: "warning",
          artifact: slice.id,
          path: slice.path,
          field: `/intentset/slice/usesResources/${k}`,
          message: `${slice.id} uses resource ${id}, but the registry does not list it among the resource's consumers.`,
          remediation: `Add ${slice.id} to the consumers of ${id} in the registry, so the deployment inventory matches the slices.`,
        }),
      );
    });
  }

  // Unowned files inside the declared scope.
  for (const file of model.production) {
    if (!isCode(file) || !model.inScope(file)) continue;
    const region = model.regionOf(file);
    if (region.kind === "backend") {
      findings.push(
        finding({
          code: "AMP004",
          artifact: null,
          path: file,
          message: `Backend file ${file} is claimed by no slice and recorded as no resource.`,
          remediation:
            "Add it to the backend claim of the slice that owns it, or record it in the resource registry with its technical owner (AMP004).",
        }),
      );
    } else if (region.kind === "unowned") {
      findings.push(
        finding({
          code: "VSA009",
          artifact: null,
          path: file,
          message: `Source file ${file} is claimed by no slice and lies in no shared, infrastructure or composition region.`,
          remediation: "Claim it from the slice that owns it, or move it into a declared region (VSA §3, VSA009).",
        }),
      );
    }
  }

  return findings;
}
