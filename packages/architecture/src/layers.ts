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
 * each layer also importing itself. The same declaration names the slice's
 * external-access seam (the `external` layer, VSA010 and AMP002) and its pure
 * layers (`policy` and `model`, AMP006). A slice that declares no layers
 * falls back to the reference layout's folders under an entrypoint's
 * directory: client/, domain/policies/, domain/models/. A slice has one
 * entrypoint per package, so a file uses the folders under the entrypoint
 * directory nearest above it.
 */
import type { ArchitectureConfig } from "./config.ts";
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

/** The fallback folders under the root a path belongs to, or under every root when no path is given. */
function under(slice: SliceInfo, folders: string[], path?: string): string[] {
  const roots = path === undefined ? slice.roots : [rootOf(slice, path)].filter((root) => root !== null);
  return roots.flatMap((root) => folders.map((folder) => (root === "" ? `${folder}/**` : `${root}/${folder}/**`)));
}

/** The slice's declared external-access seam; for a slice that declares none, the client/ folder under each entrypoint (or the one above `path`). */
export function seamPatterns(slice: SliceInfo, path?: string): string[] {
  const declared = slice.meta.layers.external ?? [];
  return declared.length > 0 ? declared : under(slice, ["client"], path);
}

/** The slice's pure layers: policies and models, which must stay free of clients and SDKs. */
export function purePatterns(slice: SliceInfo, path?: string): string[] {
  const declared = [...(slice.meta.layers.policy ?? []), ...(slice.meta.layers.model ?? [])];
  return declared.length > 0 ? declared : under(slice, ["domain/policies", "domain/models"], path);
}

export function inSeam(slice: SliceInfo, path: string): boolean {
  return matchAny(seamPatterns(slice, path), path);
}

export function isPure(slice: SliceInfo, path: string): boolean {
  return matchAny(purePatterns(slice, path), path);
}

/** May a file in layer `from` import one in layer `to`? Unknown layers are never allowed anything. */
export function layerAllows(config: ArchitectureConfig, from: string, to: string): boolean {
  if (from === to) return true;
  return (config.layerMatrix[from] ?? []).includes(to);
}

export function knownLayer(config: ArchitectureConfig, layer: string): boolean {
  return Object.hasOwn(config.layerMatrix, layer);
}
