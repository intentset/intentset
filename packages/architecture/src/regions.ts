/**
 * Who owns each file (VSA §1, §3, §5). Every file the checker sees falls in
 * exactly one region, decided in this order:
 *
 *   slice:<ID>       claimed by a slice (any claim kind; overlaps are VSA009)
 *   composition      config.composition, e.g. src/app/**
 *   shared           config.shared, e.g. src/shared/**
 *   infrastructure   config.infrastructure, e.g. src/infrastructure/**
 *   resource:<ID>    under a backend root and matched by a registry resource path
 *   backend          under a backend root and owned by nothing (AMP004)
 *   unowned          a code file under a source root owned by nothing (VSA009)
 *   external         everything else: root configuration, scripts, documents
 *
 * Test files are kept apart (profile §3): they belong to the slice whose
 * claim patterns match them, and only the foreign-internals rules apply.
 */
import type { Artifact, Graph, Registries, Resource, SliceMeta } from "@intentset/core";
import type { ArchitectureConfig } from "./config.ts";
import { dirname, isCode, within } from "./paths.ts";
import { compareStrings, expandClaims, matchAny, matchPattern, validatePattern } from "./patterns.ts";

export type RegionKind =
  | "slice"
  | "composition"
  | "shared"
  | "infrastructure"
  | "resource"
  | "backend"
  | "unowned"
  | "external";

export interface Region {
  kind: RegionKind;
  /** Slice ID for "slice", resource ID for "resource". */
  owner?: string;
}

export function regionLabel(region: Region): string {
  return region.owner === undefined ? region.kind : `${region.kind}:${region.owner}`;
}

export interface SliceInfo {
  id: string;
  /** The slice.md path. */
  path: string;
  artifact: Artifact;
  meta: SliceMeta;
  /** Directory of the entrypoint: where the profile's ui/, client/ and domain/ folders live. */
  root: string;
  dependsOn: string[];
  exposes: string[];
  consumes: string[];
  /** Files per claim, in claim order; empty for an invalid pattern. */
  claimFiles: string[][];
  /** Claim indexes whose pattern is invalid. */
  invalidClaims: number[];
}

export interface ResourceInfo {
  resource: Resource;
  index: number;
  files: string[];
}

export interface Model {
  config: ArchitectureConfig;
  /** Every file not ignored, by path. */
  files: ReadonlyMap<string, string>;
  /** Files not ignored and not tests, sorted. */
  production: string[];
  /** Test files not ignored, sorted. */
  tests: string[];
  slices: SliceInfo[];
  sliceById: Map<string, SliceInfo>;
  /** Production file -> the slices (and claim index) that claim it, sorted by slice ID. */
  claimOwners: Map<string, { slice: string; claim: number }[]>;
  resources: ResourceInfo[];
  regionOf(path: string): Region;
  /** The slice a test file belongs to, by claim pattern, or null. */
  testOwner(path: string): string | null;
  inScope(path: string): boolean;
  isTest(path: string): boolean;
  underBackend(path: string): boolean;
}

/** Slices that own files: every slice artifact with slice metadata that is not retired. */
export function activeSlices(graph: Graph): Artifact[] {
  return [...graph.artifacts.values()]
    .filter(
      (artifact) =>
        artifact.meta.type === "slice" && artifact.meta.slice !== undefined && artifact.meta.status !== "retired",
    )
    .sort((a, b) => compareStrings(a.meta.id, b.meta.id));
}

export function buildModel(
  graph: Graph,
  registries: Registries,
  tree: ReadonlyMap<string, string>,
  config: ArchitectureConfig,
): Model {
  const files = new Map<string, string>();
  for (const path of [...tree.keys()].sort(compareStrings)) {
    if (!matchAny(config.ignore, path)) files.set(path, tree.get(path) as string);
  }
  const isTest = (path: string) => matchAny(config.tests, path);
  const production = [...files.keys()].filter((path) => !isTest(path));
  const tests = [...files.keys()].filter(isTest);

  const slices: SliceInfo[] = activeSlices(graph).map((artifact) => {
    const meta = artifact.meta.slice as SliceMeta;
    const invalidClaims: number[] = [];
    meta.claims.forEach((claim, i) => {
      if (validatePattern(claim.path) !== null) invalidClaims.push(i);
    });
    // A verification claim names tests, so it resolves against them as well;
    // every other kind resolves against production files only, so a source
    // claim over a directory does not sweep in the tests that sit beside it.
    const withTests = [...production, ...tests].sort(compareStrings);
    const claimFiles = meta.claims.map((claim, i) =>
      invalidClaims.includes(i)
        ? []
        : (expandClaims([claim], claim.kind === "verification" ? withTests : production, [])[0] ?? []),
    );
    return {
      id: artifact.meta.id,
      path: artifact.path,
      artifact,
      meta,
      root: dirname(meta.entrypoint),
      dependsOn: [...(artifact.meta.links.dependsOn ?? [])].sort(compareStrings),
      exposes: [...(artifact.meta.links.exposes ?? [])].sort(compareStrings),
      consumes: [...(artifact.meta.links.consumes ?? [])].sort(compareStrings),
      claimFiles,
      invalidClaims,
    };
  });
  const sliceById = new Map(slices.map((slice) => [slice.id, slice]));

  const claimOwners = new Map<string, { slice: string; claim: number }[]>();
  for (const slice of slices) {
    slice.claimFiles.forEach((list, claim) => {
      for (const file of list) {
        const owners = claimOwners.get(file) ?? [];
        owners.push({ slice: slice.id, claim });
        claimOwners.set(file, owners);
      }
    });
  }
  // A file two slices claim is VSA009 either way; for its region, the slice whose directory holds it is the
  // likelier owner, so an overlap reports once rather than turning every import of the file into a boundary error.
  const home = (file: string, id: string) => {
    const root = sliceById.get(id)!.root;
    return within(root, file) === null ? -1 : root.length;
  };
  for (const [file, owners] of claimOwners) {
    owners.sort(
      (a, b) => home(file, b.slice) - home(file, a.slice) || compareStrings(a.slice, b.slice) || a.claim - b.claim,
    );
  }

  const resources: ResourceInfo[] = registries.resources.map((resource, index) => ({
    resource,
    index,
    files:
      validatePattern(resource.path) === null ? production.filter((file) => matchPattern(resource.path, file)) : [],
  }));

  const underBackend = (path: string) => matchAny(config.backendRoots, path);
  const regions = new Map<string, Region>();
  const regionOf = (path: string): Region => {
    const cached = regions.get(path);
    if (cached !== undefined) return cached;
    let region: Region;
    const owners = claimOwners.get(path);
    if (owners !== undefined && owners.length > 0) region = { kind: "slice", owner: owners[0].slice };
    else if (matchAny(config.composition, path)) region = { kind: "composition" };
    else if (matchAny(config.shared, path)) region = { kind: "shared" };
    else if (matchAny(config.infrastructure, path)) region = { kind: "infrastructure" };
    else if (underBackend(path)) {
      const resource = resources.find((info) => info.files.includes(path));
      region = resource !== undefined ? { kind: "resource", owner: resource.resource.id } : { kind: "backend" };
    } else if (isCode(path) && matchAny(config.sourceRoots, path)) region = { kind: "unowned" };
    else region = { kind: "external" };
    regions.set(path, region);
    return region;
  };

  const testOwner = (path: string): string | null => {
    for (const slice of slices) {
      if (slice.meta.claims.some((claim, i) => !slice.invalidClaims.includes(i) && matchPattern(claim.path, path)))
        return slice.id;
    }
    return null;
  };

  return {
    config,
    files,
    production,
    tests,
    slices,
    sliceById,
    claimOwners,
    resources,
    regionOf,
    testOwner,
    inScope: (path) => matchAny(config.scope, path),
    isTest,
    underBackend,
  };
}

/** The path of a file relative to its slice's root, or null when it lies elsewhere (a backend claim, say). */
export function inSliceRoot(slice: SliceInfo, path: string): string | null {
  return within(slice.root, path);
}
