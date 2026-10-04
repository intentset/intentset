/**
 * Areas (profile §9): a backend split into several Amplify backends, each its
 * own CloudFormation deployment and source API, behind one AppSync Merged API.
 * Nothing here runs unless `.intentset/architecture.yaml` declares areas.
 *
 *   AMP007  a slice names a declared area as its domain, and its claims stay in that area
 *   AMP008  no area backend imports another; the shared backend package imports no area
 *   AMP009  each model, enum and operation is declared in one area's schema (a custom type: a warning)
 *   AMP010  no relationship or reference names another area's type
 *   AMP011  only the schema bridge calls generateClient (its schema imports are checked with AMP001)
 *
 * AMP012 (cross-area access and an acyclic deploy order) and AMP013 (one
 * authorizer on the Merged API) are review assertions: neither is visible in
 * source, so they are listed for review and never reported as passing.
 */
import type { AreaConfig } from "./config.ts";
import { extractSchema, findCalls, type SchemaKind } from "./extract.ts";
import { type Finding, finding, listSome } from "./finding.ts";
import type { ImportEdge } from "./imports.ts";
import { isCode } from "./paths.ts";
import { compareStrings, matchAny } from "./patterns.ts";
import type { Model } from "./regions.ts";

export const AREA_REVIEW_REQUIRED = [
  "AMP012 backend code reaches another area's data through published resource names and the AWS SDK, and deploy-time dependencies between areas are acyclic: deployment wiring, not source",
  "AMP013 one authorizer on the Merged API decides every request to every area and denies what it does not list: an authorizer's policy, not source",
];

export interface AreaCheck {
  findings: Finding[];
  /** What could not be read: never a pass (invariant 6). */
  unresolved: string[];
}

/** The area whose backend holds a path, or null. */
export function backendAreaOf(areas: readonly AreaConfig[], path: string): AreaConfig | null {
  return areas.find((area) => matchAny(area.backend, path)) ?? null;
}

/** The area whose backend or frontend holds a path, or null. */
export function areaOf(areas: readonly AreaConfig[], path: string): AreaConfig | null {
  return backendAreaOf(areas, path) ?? areas.find((area) => matchAny(area.frontend, path)) ?? null;
}

/** True when the path is one of the declared areas' schema files. */
export function isAreaSchema(areas: readonly AreaConfig[], path: string): boolean {
  return areas.some((area) => area.schema === path);
}

const OPERATION_KINDS = new Set<SchemaKind | null>(["model", "enum", "query", "mutation", "subscription", null]);

export function checkAreas(model: Model, edges: readonly ImportEdge[]): AreaCheck {
  const { areas, sharedBackend, schemaBridge } = model.config;
  const findings: Finding[] = [];
  const unresolved: string[] = [];
  if (areas.length === 0) return { findings, unresolved };
  const names = areas.map((area) => area.name).join(", ");

  // AMP007: every slice in a declared area, and its claims inside it.
  for (const slice of model.slices) {
    const area = areas.find((candidate) => candidate.name === slice.meta.domain);
    if (area === undefined) {
      findings.push(
        finding({
          code: "AMP007",
          artifact: slice.id,
          path: slice.path,
          field: "/intentset/slice/domain",
          message: `${slice.id} names the domain "${slice.meta.domain}", which is not a declared area; the areas are ${names}.`,
          remediation:
            "Set domain to the area whose backend serves the slice, or declare the area in .intentset/architecture.yaml (profile §9, AMP007).",
        }),
      );
      continue;
    }
    slice.meta.claims.forEach((claim, i) => {
      const foreign = slice.claimFiles[i].filter((file) => {
        const other = areaOf(areas, file);
        return other !== null && other.name !== area.name;
      });
      if (foreign.length === 0) return;
      const others = [...new Set(foreign.map((file) => areaOf(areas, file)?.name as string))].sort(compareStrings);
      findings.push(
        finding({
          code: "AMP007",
          artifact: slice.id,
          path: slice.path,
          field: `/intentset/slice/claims/${i}/path`,
          message: `The ${claim.kind} claim ${claim.path} of ${slice.id}, a slice of area ${area.name}, reaches into area ${others.join(" and ")}: ${listSome(foreign)}.`,
          remediation:
            "Narrow the claim to the slice's own area, or move the slice to the area that holds those files (profile §9, AMP007).",
          paths: foreign,
        }),
      );
    });
  }

  // AMP008: area backends deploy apart, so neither imports the other; shared backend code imports no area.
  for (const edge of edges) {
    if (edge.to === null || !model.inScope(edge.from)) continue;
    const to = backendAreaOf(areas, edge.to);
    if (to === null) continue;
    const from = backendAreaOf(areas, edge.from);
    const location = { line: edge.line };
    if (from !== null && from.name !== to.name) {
      findings.push(
        finding({
          code: "AMP008",
          artifact: null,
          path: edge.from,
          location,
          message: `${edge.from}, in the ${from.name} backend, imports ${edge.to} from the ${to.name} backend, and area backends deploy separately.`,
          remediation:
            "Move what both need into the shared backend package, and reach the other area's data through its published resource names (profile §9, AMP008, AMP012).",
          edges: [{ from: edge.from, to: edge.to }],
        }),
      );
    } else if (from === null && matchAny(sharedBackend, edge.from)) {
      findings.push(
        finding({
          code: "AMP008",
          artifact: null,
          path: edge.from,
          location,
          message: `${edge.from}, in the shared backend package, imports ${edge.to} from the ${to.name} backend, and the shared package must stay domain-neutral.`,
          remediation:
            "Pass what the shared code needs in as a parameter, or move the code into the area that owns it (profile §9, AMP008).",
          edges: [{ from: edge.from, to: edge.to }],
        }),
      );
    }
  }

  // AMP009 and AMP010: one owner per name across the areas' schemas, and no reference across them.
  const declared = new Map<string, { area: string; kind: SchemaKind | null; schema: string; line: number }[]>();
  const read = new Map<string, ReturnType<typeof extractSchema>>();
  for (const area of areas) {
    const text = model.files.get(area.schema);
    if (text === undefined) {
      findings.push(
        finding({
          code: "AMP009",
          artifact: null,
          path: area.schema,
          message: `The schema of area ${area.name}, ${area.schema}, is not a file in the repository, so its declarations were not checked.`,
          remediation: "Correct the area's schema path in .intentset/architecture.yaml (profile §9).",
        }),
      );
      continue;
    }
    const extraction = extractSchema(area.schema, text);
    read.set(area.name, extraction);
    if (!extraction.found) {
      unresolved.push(
        `${area.schema}: no <builder>.schema({ ... }) call, so area ${area.name}'s declarations were not read`,
      );
    }
    for (const problem of extraction.problems) unresolved.push(`${area.schema}:${problem.line}: ${problem.message}`);
    for (const declaration of extraction.declarations) {
      const list = declared.get(declaration.name) ?? [];
      list.push({ area: area.name, kind: declaration.kind, schema: area.schema, line: declaration.line });
      declared.set(declaration.name, list);
    }
  }
  for (const name of [...declared.keys()].sort(compareStrings)) {
    const owners = declared.get(name) ?? [];
    const inAreas = [...new Set(owners.map((owner) => owner.area))].sort(compareStrings);
    if (inAreas.length < 2) continue;
    const later = owners.find((owner) => owner.area === inAreas[1]) ?? owners[1];
    const operation = owners.some((owner) => OPERATION_KINDS.has(owner.kind));
    findings.push(
      finding({
        code: "AMP009",
        ...(operation ? {} : { severity: "warning" as const }),
        artifact: null,
        path: later.schema,
        location: { line: later.line },
        message: operation
          ? `${name} is declared in the schemas of areas ${inAreas.join(" and ")}; the Merged API joins every area into one namespace and refuses a field two sources resolve.`
          : `The custom type ${name} is declared in the schemas of areas ${inAreas.join(" and ")}, which share one type namespace in the Merged API.`,
        remediation: operation
          ? `Keep ${name} in the one area whose functions read and write it, and link to it from the others by ID (profile §9, AMP009).`
          : `Prefix the type with its area's name, or name it after the operation that returns it (profile §9, AMP009).`,
        paths: [...new Set(owners.map((owner) => owner.schema))].sort(compareStrings),
      }),
    );
  }
  for (const area of areas) {
    const extraction = read.get(area.name);
    if (extraction === undefined) continue;
    const own = new Set(extraction.declarations.map((declaration) => declaration.name));
    for (const reference of extraction.references) {
      if (own.has(reference.target)) continue;
      const elsewhere = (declared.get(reference.target) ?? []).map((owner) => owner.area);
      if (elsewhere.length === 0) continue;
      findings.push(
        finding({
          code: "AMP010",
          artifact: null,
          path: area.schema,
          location: { line: reference.line },
          message: `${area.schema} ${reference.via}("${reference.target}") names a type that area ${elsewhere.sort(compareStrings)[0]} declares; relationships and references do not cross areas.`,
          remediation:
            "Store the other area's ID as a plain field and resolve it in a function of this area (profile §9, AMP010).",
        }),
      );
    }
  }

  // AMP011: one client, on the Merged API, made in one place.
  for (const [path, text] of model.files) {
    if (path === schemaBridge || !isCode(path) || model.isTest(path) || !model.inScope(path)) continue;
    if (model.underBackend(path) || matchAny(sharedBackend, path)) continue;
    if (!text.includes("generateClient")) continue;
    const lines = findCalls(path, text, "generateClient");
    if (lines.length === 0) continue;
    findings.push(
      finding({
        code: "AMP011",
        artifact: null,
        path,
        location: { line: lines[0] },
        message:
          schemaBridge === null
            ? `${path} calls generateClient, and this repository declares no schema bridge to make the one client on the Merged API.`
            : `${path} calls generateClient; only the schema bridge ${schemaBridge} makes the client, once, on the Merged API.`,
        remediation:
          "Declare schemaBridge in .intentset/architecture.yaml and import the client from it everywhere else (profile §9, AMP011).",
      }),
    );
  }
  return { findings, unresolved };
}
