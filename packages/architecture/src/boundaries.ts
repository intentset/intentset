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
 *   6. VSA006  an edge inside one slice that the layer matrix does not allow;
 *              or, where the edge's own target is allowed or in no layer (an
 *              entrypoint, a barrel in a permitted layer, another slice's
 *              entrypoint), a name it takes that is defined in a layer the
 *              importer's may not import. The file that defines a name
 *              decides, however many files pass it on, and another slice's
 *              contract does not widen what a layer may reach (VSA §5,
 *              profile §3). A name that cannot be followed is listed as not
 *              checked.
 *
 * Beside those: TS002 (warning) when one slice reaches another's entrypoint
 * by relative path although an alias for it is configured; AMP002 when a
 * slice file outside its client seam imports a backend SDK; TS007 when a
 * slice file imports a package its layer's `forbiddenPackages` names, such as
 * a UI framework in a policy, a model or the client seam; TS001 (warning)
 * when an entrypoint re-exports with `export *`. TS008, a slice file outside
 * presentation that renders JSX, is `checkJsx`: it reads the file, not an
 * edge.
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
import { type ImportEdge, takenBy } from "./imports.ts";
import { fileLayer, inSeam, isPure, knownLayer, layerAllows, layerOf } from "./layers.ts";
import { NameIndex } from "./names.ts";
import { compareStrings, matchAny, matchPattern } from "./patterns.ts";
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
  /** Names a layered file takes that could not be followed to the file that defines them: not checked, never passed. */
  untraced: string[];
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

export function checkBoundaries(
  model: Model,
  edges: readonly ImportEdge[],
  resolver: Resolver,
  names: NameIndex = new NameIndex(edges, new Map()),
): BoundaryResult {
  const { config } = model;
  const findings: Finding[] = [];
  const untraced: string[] = [];
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
    const subject = {
      edges: [{ from, to }, ...(owner !== null ? [{ from: owner, to: target.id }] : [])],
      taken: takenBy(edge),
    };
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

  /** What the layer matrix lets `layer` import, itself first. */
  const allowedFrom = (layer: string): string[] =>
    [layer, ...(config.layerMatrix[layer] ?? [])].filter((value, i, all) => all.indexOf(value) === i);

  // VSA006 for the names an edge takes through files that pass them on: each is judged by the layer of the file
  // that defines it, in the importer's slice or in the slice whose entrypoint it came through.
  const passedOn = (edge: ImportEdge, source: SliceInfo): Finding | null => {
    const from = edge.from;
    const a = layerOf(source, from);
    if (a.layer === null || !knownLayer(config, a.layer)) return null;
    type Refused = { names: string[]; typed: string[]; through: string[]; layer: string; owner: SliceInfo };
    const refused = new Map<string, Refused>();
    for (const definition of names.definitions(edge)) {
      const { origin } = definition;
      if (origin.kind === "untraced") {
        const what = definition.name === "*" ? "the names" : `the name ${definition.name}`;
        untraced.push(
          `${from}:${edge.line}: ${what} "${edge.specifier}" passes on could not be followed to the file that defines ${definition.name === "*" ? "them" : "it"} (${origin.why}), so ${definition.name === "*" ? "their layers were" : "its layer was"} not checked`,
        );
        continue;
      }
      // A name the edge's own target defines is judged with the edge itself; a package's, by the package rules.
      if (origin.kind === "package" || origin.through.length === 0) continue;
      const owner = sliceOf(model.regionOf(origin.file));
      if (owner === undefined) continue;
      const b = layerOf(owner, origin.file);
      if (b.layer === null || !knownLayer(config, b.layer) || layerAllows(config, a.layer, b.layer)) continue;
      const entry = refused.get(origin.file) ?? {
        names: [],
        typed: [],
        through: origin.through,
        layer: b.layer,
        owner,
      };
      entry.names.push(definition.name);
      entry.typed.push(`${definition.typeOnly ? "type " : ""}${definition.name} from ${origin.file}`);
      refused.set(origin.file, entry);
    }
    if (refused.size === 0) return null;
    const files = [...refused.keys()].sort(compareStrings);
    const foreign = files.some((file) => refused.get(file)?.owner.id !== source.id);
    const parts = files.map((file) => {
      const entry = refused.get(file) as Refused;
      const of = entry.owner.id === source.id ? "" : ` of ${entry.owner.id}`;
      const via = entry.through.length > 1 ? ` by way of ${entry.through.slice(1).join(", ")}` : "";
      return `${entry.names.join(", ")} from ${file}, in the ${entry.layer} layer${of}${via}`;
    });
    const owners = [...new Set(files.map((file) => refused.get(file)?.owner.id as string))].filter(
      (id) => id !== source.id,
    );
    return finding({
      code: "VSA006",
      artifact: source.id,
      path: from,
      location: { line: edge.line },
      message: `${from} is in the ${a.layer} layer of ${source.id} and ${how(edge)}, which passes on ${parts.join("; and ")}.`,
      remediation: `The ${a.layer} layer may import ${allowedFrom(a.layer).join(", ")}, whichever file passes a name on${foreign ? ", and another slice's contract does not widen that" : ""}; take what it needs from a layer it may import, such as a use-case that makes the call (profile §3).`,
      edges: [
        { from, to: edge.to as string },
        ...files.map((file) => ({ from, to: file })),
        ...owners.map((id) => ({ from: source.id, to: id })),
      ],
      // Each name with the file that defines it, so a name passed on from another file is a new entry.
      taken: {
        ...takenBy(edge),
        names: files.flatMap((file) => (refused.get(file) as Refused).typed).sort(compareStrings),
      },
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
            taken: takenBy(edge),
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
            taken: takenBy(edge),
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
          taken: takenBy(edge),
        }),
      );
    }

    if (edge.to === null) {
      const specifier = edge.specifier.replace(/^node:/, "");
      if (source !== undefined && !model.underBackend(from) && matchAny(config.backendSdks, specifier)) {
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
              taken: takenBy(edge),
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
              taken: takenBy(edge),
            }),
          );
        }
        continue;
      }
      const layer = source !== undefined && !model.underBackend(from) ? fileLayer(source, from) : null;
      const pattern =
        layer === null ? undefined : (config.forbiddenPackages[layer] ?? []).find((p) => matchPattern(p, specifier));
      if (source !== undefined && layer !== null && pattern !== undefined) {
        findings.push(
          finding({
            code: "TS007",
            artifact,
            path: from,
            location,
            message: `${from} is in the ${layer} layer of ${source.id} and ${how(edge)}, a package the ${layer} layer may not import (forbiddenPackages: ${pattern}).`,
            remediation: forbiddenRemediation(layer, specifier),
            edges: [{ from, to: edge.specifier }],
            taken: takenBy(edge),
          }),
        );
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
    const subject = {
      edges: [{ from, to }, ...(source && target ? [{ from: source.id, to: target.id }] : [])],
      taken: takenBy(edge),
    };

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
      if (source !== undefined) {
        const passed = passedOn(edge, source);
        if (passed !== null) findings.push(passed);
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
      if (
        a.layer !== null &&
        b.layer !== null &&
        knownLayer(config, a.layer) &&
        knownLayer(config, b.layer) &&
        !layerAllows(config, a.layer, b.layer)
      ) {
        findings.push(
          finding({
            code: "VSA006",
            artifact,
            path: from,
            location,
            message: `${from} is in the ${a.layer} layer of ${source.id} and ${how(edge)}, which is in the ${b.layer} layer.`,
            remediation: `The ${a.layer} layer may import ${allowedFrom(a.layer).join(", ")}; move the dependency so it flows downward (profile §3).`,
            ...subject,
          }),
        );
        continue;
      }
      const passed = passedOn(edge, source);
      if (passed !== null) findings.push(passed);
    }
  }

  return { findings, sliceEdges, fileEdges, crossSliceEdges, untraced: [...new Set(untraced)].sort(compareStrings) };
}

function forbiddenRemediation(layer: string, specifier: string): string {
  if (layer === "policy" || layer === "model") {
    return `Policies and models stay free of UI and transport: keep what needs "${specifier}" in the presentation layer and pass plain values in (profile §3, TS007).`;
  }
  if (layer === "external") {
    return `The client seam is transport: return plain values from it, and let a hook in the presentation layer hold the state "${specifier}" provides (profile §3, TS007).`;
  }
  return `Move what needs "${specifier}" to a layer that may import it, or change forbiddenPackages in .intentset/architecture.yaml if the policy is wrong (TS007).`;
}

/** The profile's layers other than presentation, which render no JSX (TS008). A layer of the repository's own naming is not judged. */
const NO_JSX_LAYERS = ["application", "policy", "model", "external"];

/**
 * TS008: a slice file outside the presentation layer that renders JSX. The automatic runtime needs no import for it,
 * so this reads the file rather than an edge. Composition, shared code and tests may render; a file in no layer is
 * VSA006's warning already.
 */
export function checkJsx(model: Model, jsx: ReadonlyMap<string, number>): Finding[] {
  const findings: Finding[] = [];
  for (const path of [...jsx.keys()].sort(compareStrings)) {
    if (!model.inScope(path) || model.isTest(path) || model.underBackend(path)) continue;
    const region = model.regionOf(path);
    const slice = region.kind === "slice" ? model.sliceById.get(region.owner as string) : undefined;
    if (slice === undefined || slice.meta.entrypoints.includes(path)) continue;
    const layer = fileLayer(slice, path);
    if (layer === null || !NO_JSX_LAYERS.includes(layer)) continue;
    findings.push(
      finding({
        code: "TS008",
        artifact: slice.id,
        path,
        location: { line: jsx.get(path) as number },
        message: `${path} is in the ${layer} layer of ${slice.id} and renders JSX, which only the presentation layer may.`,
        remediation:
          layer === "external"
            ? "The client seam is transport: return data from it and render it in a component under the presentation layer (profile §3, TS008)."
            : "Move the markup into a component in the presentation layer, and pass it the values this file computes (profile §3, TS008).",
      }),
    );
  }
  return findings;
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
