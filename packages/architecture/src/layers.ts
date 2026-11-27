/**
 * A slice's internal layers (VSA006, profile §3). The slice declares its
 * layers by pattern; the profile's matrix says which may import which:
 *
 *   presentation -> application, policy, model
 *   application  -> policy, model, external
 *   policy       -> model
 *   model        -> model
 *   external     -> model
 *
 * each layer also importing itself. Those are the reference profile's names. A profile names its own layers and
 * says which play the fixed roles (profile contract §3): the seam, the one layer that may reach a backend (the
 * reference profile's `external`, VSA010 and AMP002); the pure layers, free of SDKs and UI (`policy` and `model`,
 * AMP006); and the rendering layers (`presentation`, TS008). A slice that declares no layers falls back to the
 * profile's folders for a layer under an entrypoint's directory, the reference layout's being client/,
 * domain/policies/ and domain/models/. A slice has one entrypoint per package, so a file uses the folders under the
 * entrypoint directory nearest above it.
 */
import { type ArchitectureConfig, DEFAULT_ARCHITECTURE_CONFIG } from "./config.ts";
import { matchAny } from "./patterns.ts";
import { rootOf, type SliceInfo } from "./regions.ts";

export type LayerOf = { layer: string } | { layer: null; reason: "none" | "ambiguous"; candidates: string[] };

export function layerOf(slice: SliceInfo, path: string): LayerOf {
  const matches = Object.keys(slice.meta.layers)
    .sort()
    .filter((layer) => matchAny(slice.meta.layers[layer], path));
  if (matches.length === 1) return { layer: matches[0] };
  return { layer: null, reason: matches.length === 0 ? "none" : "ambiguous", candidates: matches };
}

/** What the layer functions read of a profile: its layers, their roles and the folders that stand for a layer. */
export type LayerProfile = Pick<ArchitectureConfig, "layers" | "roles" | "layerFolders">;

/** The folders that stand for each of `layers` in a slice that declares none, in the profile's order. */
function folders(profile: LayerProfile, layers: readonly string[]): string[] {
  return profile.layers.filter((layer) => layers.includes(layer)).flatMap((layer) => profile.layerFolders[layer] ?? []);
}

/**
 * The layer a file is in for the package and JSX rules (TS007, TS008): the one layer it is declared in, or, for a
 * slice that declares no layers, its client/, domain/policies/ or domain/models/ folder under the entrypoint
 * directory above it. Null when it is in none, or in more than one.
 */
export function fileLayer(
  slice: SliceInfo,
  path: string,
  profile: LayerProfile = DEFAULT_ARCHITECTURE_CONFIG,
): string | null {
  if (Object.keys(slice.meta.layers).length > 0) return layerOf(slice, path).layer;
  for (const layer of profile.layers) {
    if (matchAny(under(slice, profile.layerFolders[layer] ?? [], path), path)) return layer;
  }
  return null;
}

/** The fallback folders under the root a path belongs to, or under every root when no path is given. */
function under(slice: SliceInfo, folders: string[], path?: string): string[] {
  const roots = path === undefined ? slice.roots : [rootOf(slice, path)].filter((root) => root !== null);
  return roots.flatMap((root) => folders.map((folder) => (root === "" ? `${folder}/**` : `${root}/${folder}/**`)));
}

/** The slice's declared external-access seam; for a slice that declares none, the client/ folder under each entrypoint (or the one above `path`). */
export function seamPatterns(
  slice: SliceInfo,
  path?: string,
  profile: LayerProfile = DEFAULT_ARCHITECTURE_CONFIG,
): string[] {
  const seam = profile.roles.seam === null ? [] : [profile.roles.seam];
  const declared = seam.flatMap((layer) => slice.meta.layers[layer] ?? []);
  return declared.length > 0 ? declared : under(slice, folders(profile, seam), path);
}

/** The slice's pure layers: policies and models, which must stay free of clients and SDKs. */
export function purePatterns(
  slice: SliceInfo,
  path?: string,
  profile: LayerProfile = DEFAULT_ARCHITECTURE_CONFIG,
): string[] {
  const declared = profile.roles.pure.flatMap((layer) => slice.meta.layers[layer] ?? []);
  return declared.length > 0 ? declared : under(slice, folders(profile, profile.roles.pure), path);
}

export function inSeam(slice: SliceInfo, path: string, profile: LayerProfile = DEFAULT_ARCHITECTURE_CONFIG): boolean {
  return matchAny(seamPatterns(slice, path, profile), path);
}

export function isPure(slice: SliceInfo, path: string, profile: LayerProfile = DEFAULT_ARCHITECTURE_CONFIG): boolean {
  return matchAny(purePatterns(slice, path, profile), path);
}

/** Does this rule set run under the configuration's profile (profile contract §5)? */
export function runs(config: Pick<ArchitectureConfig, "ruleSets">, ruleSet: string): boolean {
  return config.ruleSets.includes(ruleSet);
}

/** May a file in layer `from` import one in layer `to`? Unknown layers are never allowed anything. */
export function layerAllows(config: ArchitectureConfig, from: string, to: string): boolean {
  if (from === to) return true;
  return (config.layerMatrix[from] ?? []).includes(to);
}

export function knownLayer(config: ArchitectureConfig, layer: string): boolean {
  return Object.hasOwn(config.layerMatrix, layer);
}
