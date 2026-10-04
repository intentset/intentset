/**
 * The rules one import edge can break (VSA003, VSA006, region boundaries;
 * profile TS001–TS003, TS006, AMP001, AMP002, AMP006). Each edge gets at
 * most one boundary finding, the most specific that applies, in this order:
 *
 *   1. AMP001  frontend code importing anything under a backend root, unless
 *              a client-seam file imports a named response-parser module.
 *   2. REG001  region boundary: shared importing infrastructure, composition
 *              or a slice; infrastructure importing composition or a slice;
 *              a slice importing composition (VSA §5). VSA007 is a review
 *              assertion about business ownership, so a structural region
 *              violation has its own code.
 *   3. TS003   a screen of another slice imported by anything but a named
 *              router file; or one of a slice's entrypoints importing its own
 *              screen.
 *   4. VSA003  another slice's file that is none of its entrypoints, by
 *              relative path, alias or re-export; with TS006 beside it when a
 *              wildcard alias opened the path. Every entrypoint is a public
 *              surface, and the message names the one in the importer's own
 *              package first, since that is the surface it should use.
 *   5. AMP006  a policy or model file importing its slice's client seam or
 *              infrastructure, or a backend SDK.
 *   6. VSA006  an edge inside one slice that the layer matrix does not allow.
 *
 * Beside those: TS002 (warning) when one slice reaches another's entrypoint
 * by relative path although an alias for it is configured; AMP002 when a
 * slice file outside its client seam imports a backend SDK; TS001 (warning)
 * when an entrypoint re-exports with `export *`.
 *
 * Test files get the separate pass profile §3 asks for: they may import
 * their own slice's internals, and VSA003 and TS003 still apply to anyone
 * else's.
 *
 * Edges from files inside the declared scope are checked, including those to
 * a file outside it that a slice claims. Edges from files outside the scope
 * are checked for one thing only: reaching past a slice's public surfaces to
 * a file inside the scope, which is VSA003 (TS003 for a screen) as a warning,
 * so a narrow scope cannot hide its consumers and they do not fail it
 * (VSA §9). They count toward no edge total and no slice dependency.
 */
import { isAreaSchema } from "./areas.ts";
import { type Finding, finding, listSome } from "./finding.ts";
import type { ImportEdge } from "./imports.ts";
import { inSeam, isPure, knownLayer, layerAllows, layerOf } from "./layers.ts";
import { matchAny, matchPattern } from "./patterns.ts";
import { describePackage, type Model, type Region, type SliceInfo } from "./regions.ts";
import type { Resolver } from "./resolve.ts";

export interface SliceEdge {
  from: string;
  to: string;
  /** The import edges behind it, in file and line order. */
  imports: ImportEdge[];
}

export interface BoundaryResult {
  findings: Finding[];
  /** Observed slice-to-slice dependencies from production files in scope, keyed "FROM->TO". */
  sliceEdges: Map<string, SliceEdge>;
  /** Resolved file-to-file edges from production files. */
  fileEdges: number;
  /** Those between two different slices. */
  crossSliceEdges: number;
}

function how(edge: ImportEdge): string {
  const kind = edge.reexport
    ? "re-exports"
    : edge.dynamic
      ? "dynamically imports"
      : edge.typeOnly
        ? "type-imports"
        : "imports";
  return `${kind} "${edge.specifier}"`;
}

function through(edge: ImportEdge): string {
  return edge.via === "relative"
    ? "a relative path"
    : edge.via === "workspace"
      ? "a package path"
      : `the ${edge.via === "baseUrl" ? "baseUrl" : "alias"} "${edge.specifier}"`;
}

/** A slice's entrypoints with those in the importer's own package first, since that is the surface it should use. */
function surfacesFor(model: Model, target: SliceInfo, from: string): { own: string[]; others: string[] } {
  const pkg = model.packageOf(from);
  const own = target.meta.entrypoints.filter((entry) => model.packageOf(entry) === pkg);
  return { own, others: target.meta.entrypoints.filter((entry) => !own.includes(entry)) };
}

/** "its public surface is X", or with several, the one in the importer's package first. */
function describeSurfaces(model: Model, target: SliceInfo, from: string): string {
  const entries = target.meta.entrypoints;
  if (entries.length === 1) return `its public surface is ${entries[0]}`;
  const { own, others } = surfacesFor(model, target, from);
  if (own.length === 0) return `its public surfaces are ${listSome(others, others.length)}`;
  const elsewhere = others.length === 0 ? "" : `, and elsewhere ${listSome(others, others.length)}`;
  return `its public surface in ${describePackage(model.packageOf(from))} is ${listSome(own, own.length)}${elsewhere}`;
}

/** The file to import instead: the entrypoint in the importer's package, or the only one. */
function importInstead(model: Model, target: SliceInfo, from: string): string {
  const { own } = surfacesFor(model, target, from);
  if (own.length > 0) return `Import ${own[0]}`;
  const entries = target.meta.entrypoints;
  return entries.length === 1 ? `Import ${entries[0]}` : `Import one of ${target.id}'s entrypoints`;
}

function describeRegion(region: Region): string {
  switch (region.kind) {
    case "slice":
      return `slice ${region.owner}`;
    case "resource":
      return `resource ${region.owner}`;
    default:
      return region.kind;
  }
}

export function checkBoundaries(model: Model, edges: readonly ImportEdge[], resolver: Resolver): BoundaryResult {
  const { config } = model;
  const findings: Finding[] = [];
  const sliceEdges = new Map<string, SliceEdge>();
  let fileEdges = 0;
  let crossSliceEdges = 0;
  const sliceOf = (region: Region): SliceInfo | undefined =>
    region.kind === "slice" ? model.sliceById.get(region.owner as string) : undefined;
  const isScreen = (path: string) => matchPattern(config.screensGlob, path);

  // VSA §9: from outside the declared scope, only an import past a slice's public surfaces into the scope is
  // reported, and as a warning. The exemptions are those that hold inside the scope.
  const outOfScope = (edge: ImportEdge): Finding | null => {
    const { from, to } = edge;
    if (to === null || !model.inScope(to)) return null;
    const target = sliceOf(model.regionOf(to));
    if (target === undefined || target.meta.entrypoints.includes(to)) return null;
    const test = model.isTest(from);
    const source = test ? undefined : sliceOf(model.regionOf(from));
    const owner = test ? model.testOwner(from) : (source?.id ?? null);
    if (owner === target.id) return null;
    if (!test && model.underBackend(to)) {
      if (source === undefined && model.underBackend(from)) return null; // the unified backend composition (VSA §7)
      if (source !== undefined && inSeam(source, from) && matchAny(config.responseParserModules, to)) return null;
    }
    const who = test ? `Test file ${from}` : from;
    const subject = { edges: [{ from, to }, ...(owner !== null ? [{ from: owner, to: target.id }] : [])] };
    const why = "It is a warning because the importer lies outside the declared scope (VSA §9).";
    if (isScreen(to)) {
      if (!test && matchAny(config.routerFiles, from)) return null;
      return finding({
        code: "TS003",
        severity: "warning",
        artifact: owner,
        path: from,
        location: { line: edge.line },
        message: `${who} lies outside the declared scope and ${how(edge)}, a screen of ${target.id}; only a named router file may import screens directly.`,
        remediation: `Let the router compose ${target.id}'s screen, or consume a component API that ${target.id} exposes through an entrypoint (TS003). ${why}`,
        ...subject,
      });
    }
    return finding({
      code: "VSA003",
      severity: "warning",
      artifact: owner,
      path: from,
      location: { line: edge.line },
      message: `${who} lies outside the declared scope and ${how(edge)}, a private file of ${target.id} reached through ${through(edge)}; ${describeSurfaces(model, target, from)}.`,
      remediation: `${importInstead(model, target, from)} and have it export what is needed (VSA003). ${why}`,
      ...subject,
    });
  };

  for (const edge of edges) {
    const from = edge.from;
    if (!model.inScope(from)) {
      const leak = outOfScope(edge);
      if (leak !== null) findings.push(leak);
      continue;
    }
    const location = { line: edge.line };

    if (model.isTest(from)) {
      if (edge.to === null) continue;
      const owner = model.testOwner(from);
      const target = sliceOf(model.regionOf(edge.to));
      if (target === undefined || target.id === owner) continue;
      if (isScreen(edge.to)) {
        findings.push(
          finding({
            code: "TS003",
            artifact: owner,
            path: from,
            location,
            message: `Test file ${from} ${how(edge)}, a screen of ${target.id}, and tests must not bypass another slice's contract.`,
            remediation: `Test ${target.id}'s screens from ${target.id}'s own tests, or drive them through the router (profile §3).`,
            edges: [{ from, to: edge.to }],
          }),
        );
      } else if (!target.meta.entrypoints.includes(edge.to)) {
        findings.push(
          finding({
            code: "VSA003",
            artifact: owner,
            path: from,
            location,
            message: `Test file ${from} ${how(edge)}, a private file of ${target.id}; ${describeSurfaces(model, target, from)}.`,
            remediation: `${importInstead(model, target, from)} instead; tests may reach only their own slice's internals (profile §3).`,
            edges: [{ from, to: edge.to }],
          }),
        );
      }
      continue;
    }

    const regionFrom = model.regionOf(from);
    const source = sliceOf(regionFrom);
    const artifact = source?.id ?? null;

    if (source?.meta.entrypoints.includes(from) && edge.wildcardExport) {
      findings.push(
        finding({
          code: "TS001",
          severity: "warning",
          artifact,
          path: from,
          location,
          message: `The entrypoint of ${source.id} re-exports everything from "${edge.specifier}" with a wildcard, which can publish private modules as contract.`,
          remediation: "Export the reviewed names explicitly (VSA §4, TS001).",
          edges: [{ from, to: edge.to ?? edge.specifier }],
        }),
      );
    }

    if (edge.to === null) {
      if (
        source !== undefined &&
        !model.underBackend(from) &&
        matchAny(config.backendSdks, edge.specifier.replace(/^node:/, ""))
      ) {
        if (isPure(source, from)) {
          findings.push(
            finding({
              code: "AMP006",
              artifact,
              path: from,
              location,
              message: `${from} is a policy or model file of ${source.id} and ${how(edge)}, a backend SDK.`,
              remediation:
                "Keep SDK and generated client types out of policies and models; adapt them in the client seam (AMP006).",
              edges: [{ from, to: edge.specifier }],
            }),
          );
        } else if (!inSeam(source, from)) {
          findings.push(
            finding({
              code: "AMP002",
              artifact,
              path: from,
              location,
              message: `${from} ${how(edge)}, a backend SDK, outside the client seam of ${source.id}.`,
              remediation: `Move the backend call into ${source.id}'s client seam and call that from here (AMP002, VSA010).`,
              edges: [{ from, to: edge.specifier }],
            }),
          );
        }
      }
      continue;
    }

    const to = edge.to;
    const regionTo = model.regionOf(to);
    const target = sliceOf(regionTo);
    fileEdges++;
    if (source !== undefined && target !== undefined && source.id !== target.id) {
      crossSliceEdges++;
      const key = `${source.id}->${target.id}`;
      const entry = sliceEdges.get(key) ?? { from: source.id, to: target.id, imports: [] };
      entry.imports.push(edge);
      sliceEdges.set(key, entry);
    }
    if (!model.inScope(to) && target === undefined) continue;
    const subject = { edges: [{ from, to }, ...(source && target ? [{ from: source.id, to: target.id }] : [])] };

    // 1. AMP001, and AMP011 for an area repository's schema bridge (profile §9). The shared backend
    // package is backend code: what it may import is AMP008's question.
    if (model.underBackend(to) && !model.underBackend(from) && !matchAny(config.sharedBackend, from)) {
      const seam = source !== undefined && inSeam(source, from);
      if (edge.typeOnly && isAreaSchema(config.areas, to)) {
        if (from !== config.schemaBridge) {
          findings.push(
            finding({
              code: "AMP011",
              artifact,
              path: from,
              location,
              message: `${from} ${how(edge)}, the schema of an area, and only the schema bridge${config.schemaBridge === null ? ", which this repository has not declared," : ` ${config.schemaBridge}`} may.`,
              remediation:
                "Import the client and its types from the schema bridge, which joins every area's schema into one type (profile §9, AMP011).",
              ...subject,
            }),
          );
        }
        continue;
      }
      if (!(seam && matchAny(config.responseParserModules, to))) {
        findings.push(
          finding({
            code: "AMP001",
            artifact,
            path: from,
            location,
            message: `${from} ${how(edge)}, the backend file ${to}${edge.typeOnly ? " (type-only imports count)" : ""}, and frontend code must not import backend definitions.`,
            remediation: seam
              ? "Only the named response-parser modules may be imported by a client seam; adapt everything else to the slice's own types (profile §4)."
              : "Reach the backend through the slice's client seam with its own transport types, or record an approved type-bridge ADR as an exception (profile §4).",
            ...subject,
          }),
        );
      }
      continue;
    }

    // 2. Region boundaries.
    const regionViolation =
      (regionFrom.kind === "shared" && ["infrastructure", "composition", "slice"].includes(regionTo.kind)) ||
      (regionFrom.kind === "infrastructure" && ["composition", "slice"].includes(regionTo.kind)) ||
      (regionFrom.kind === "slice" && regionTo.kind === "composition");
    if (regionViolation) {
      findings.push(
        finding({
          code: "REG001",
          artifact,
          path: from,
          location,
          message: `Region boundary: ${describeRegion(regionFrom)} file ${from} ${how(edge)}, which is ${describeRegion(regionTo)}.`,
          remediation:
            regionFrom.kind === "shared"
              ? "Shared code depends only on shared neutral abstractions; invert the dependency so infrastructure imports shared (VSA §5)."
              : regionFrom.kind === "infrastructure"
                ? "Infrastructure provides mechanisms and must not know slices or composition; have composition wire them together (VSA §5)."
                : "Composition depends on slices, never the reverse; pass what the slice needs in through its contract (VSA §5, §6).",
          ...subject,
        }),
      );
      continue;
    }

    // A unified backend root is compatible with VSA (§7): the backend composition (amplify/backend.ts, a recorded
    // resource) wires every slice's resource definitions. Between two slices' backend files the rules below still hold.
    if (source === undefined && model.underBackend(from) && model.underBackend(to)) continue;

    // 3 and 4. Another slice's screens and private files.
    if (target !== undefined && target.id !== source?.id) {
      if (isScreen(to)) {
        if (!matchAny(config.routerFiles, from)) {
          findings.push(
            finding({
              code: "TS003",
              artifact,
              path: from,
              location,
              message: `${from} ${how(edge)}, a screen of ${target.id}, and only a named router file may import screens directly.`,
              remediation:
                source !== undefined
                  ? `Let the router compose ${target.id}'s screen, or consume a component API that ${target.id} exposes through an entrypoint (TS003).`
                  : "Import the screen from the router file named in routerFiles, or name this file there if it is the router (TS003).",
              ...subject,
            }),
          );
        }
        continue;
      }
      if (!target.meta.entrypoints.includes(to)) {
        findings.push(
          finding({
            code: "VSA003",
            artifact,
            path: from,
            location,
            message: `${source ? source.id : describeRegion(regionFrom)} ${how(edge)}, a private file of ${target.id} reached through ${through(edge)}; ${describeSurfaces(model, target, from)}.`,
            remediation: `${importInstead(model, target, from)} and have it export what is needed, or move the shared rule into a contract (VSA003).`,
            ...subject,
          }),
        );
        if (edge.wildcardAlias && (edge.via === "alias" || edge.via === "workspace")) {
          findings.push(
            finding({
              code: "TS006",
              artifact,
              path: from,
              location,
              message: `The wildcard in "${edge.specifier}" opens ${to}, a private file of ${target.id}, to code outside the slice.`,
              remediation: `Map the alias for ${target.id} to its entrypoints only, so the alias cannot reach internals (TS006).`,
              ...subject,
            }),
          );
        }
        continue;
      }
      if (source !== undefined && (edge.via === "relative" || edge.via === "baseUrl")) {
        const alias = resolver.aliasFor(from, to);
        if (alias !== null) {
          findings.push(
            finding({
              code: "TS002",
              severity: "warning",
              artifact,
              path: from,
              location,
              message: `${source.id} reaches the entrypoint of ${target.id} through "${edge.specifier}" rather than its configured alias "${alias}".`,
              remediation: `Import "${alias}" (TS002).`,
              ...subject,
            }),
          );
        }
      }
      continue;
    }

    if (source === undefined) continue;

    // Inside one slice, or out to shared and infrastructure.
    if (target !== undefined && source.meta.entrypoints.includes(from) && isScreen(to)) {
      findings.push(
        finding({
          code: "TS003",
          artifact,
          path: from,
          location,
          message: `The entrypoint of ${source.id} ${how(edge)}, one of its screens, and screens must not be exported from a slice's contract.`,
          remediation: "Remove the screen from the entrypoint and let the named router import it (TS003).",
          ...subject,
        }),
      );
      continue;
    }
    // 5. AMP006
    if (isPure(source, from) && ((target !== undefined && inSeam(source, to)) || regionTo.kind === "infrastructure")) {
      findings.push(
        finding({
          code: "AMP006",
          artifact,
          path: from,
          location,
          message: `${from} is a policy or model file of ${source.id} and ${how(edge)}, which is ${regionTo.kind === "infrastructure" ? "infrastructure" : "its client seam"}.`,
          remediation:
            "Policies and models import models only; have a use-case call the client and pass plain values in (AMP006).",
          ...subject,
        }),
      );
      continue;
    }
    // 6. VSA006
    if (target !== undefined) {
      const a = layerOf(source, from);
      const b = layerOf(source, to);
      if (a.layer === null || b.layer === null || !knownLayer(config, a.layer) || !knownLayer(config, b.layer))
        continue;
      if (!layerAllows(config, a.layer, b.layer)) {
        const allowed = [a.layer, ...(config.layerMatrix[a.layer] ?? [])].filter(
          (value, i, all) => all.indexOf(value) === i,
        );
        findings.push(
          finding({
            code: "VSA006",
            artifact,
            path: from,
            location,
            message: `${from} is in the ${a.layer} layer of ${source.id} and ${how(edge)}, which is in the ${b.layer} layer.`,
            remediation: `The ${a.layer} layer may import ${allowed.join(", ")}; move the dependency so it flows downward (profile §3).`,
            ...subject,
          }),
        );
      }
    }
  }

  return { findings, sliceEdges, fileEdges, crossSliceEdges };
}

/** One warning per slice whose code files are in no declared layer, or in a layer the matrix does not know (VSA006). */
export function checkUnclassified(model: Model): Finding[] {
  const findings: Finding[] = [];
  for (const slice of model.slices) {
    const unclassified: string[] = [];
    const files = new Set(slice.claimFiles.flat());
    for (const file of [...files].sort()) {
      if (
        !/\.[cm]?[jt]sx?$/.test(file) ||
        matchAny(model.config.tests, file) ||
        slice.meta.entrypoints.includes(file) ||
        model.underBackend(file) ||
        !model.inScope(file)
      )
        continue;
      // A file another slice also claims is VSA009 already, and its region is that slice's.
      if (model.regionOf(file).owner !== slice.id) continue;
      const placed = layerOf(slice, file);
      if (placed.layer === null || !knownLayer(model.config, placed.layer)) unclassified.push(file);
    }
    if (unclassified.length === 0) continue;
    findings.push(
      finding({
        code: "VSA006",
        severity: "warning",
        artifact: slice.id,
        path: slice.path,
        field: "/intentset/slice/layers",
        message: `${unclassified.length === 1 ? "1 file" : `${unclassified.length} files`} of ${slice.id} ${unclassified.length === 1 ? "is" : "are"} in no single layer the matrix knows, so ${unclassified.length === 1 ? "its" : "their"} imports were not layer-checked: ${unclassified.slice(0, 3).join(", ")}${unclassified.length > 3 ? ` and ${unclassified.length - 3} more` : ""}.`,
        remediation:
          "Cover each file with exactly one of the presentation, application, policy, model and external layer patterns (VSA006).",
        paths: unclassified,
      }),
    );
  }
  return findings;
}
