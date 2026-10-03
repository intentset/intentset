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
 * falls back to the reference layout's folders under its entrypoint's
 * directory: client/, domain/policies/, domain/models/.
 */
import type { ArchitectureConfig } from "./config.ts";
import { matchAny } from "./patterns.ts";
import type { SliceInfo } from "./regions.ts";

export type LayerOf = { layer: string } | { layer: null; reason: "none" | "ambiguous"; candidates: string[] };

export function layerOf(slice: SliceInfo, path: string): LayerOf {
  const matches = Object.keys(slice.meta.layers)
    .sort()
    .filter((layer) => matchAny(slice.meta.layers[layer], path));
  if (matches.length === 1) return { layer: matches[0] };
  return { layer: null, reason: matches.length === 0 ? "none" : "ambiguous", candidates: matches };
}

function under(slice: SliceInfo, folder: string): string {
  return slice.root === "" ? `${folder}/**` : `${slice.root}/${folder}/**`;
}

/** The slice's declared external-access seam. */
export function seamPatterns(slice: SliceInfo): string[] {
  const declared = slice.meta.layers.external ?? [];
  return declared.length > 0 ? declared : [under(slice, "client")];
}

/** The slice's pure layers: policies and models, which must stay free of clients and SDKs. */
export function purePatterns(slice: SliceInfo): string[] {
  const declared = [...(slice.meta.layers.policy ?? []), ...(slice.meta.layers.model ?? [])];
  return declared.length > 0 ? declared : [under(slice, "domain/policies"), under(slice, "domain/models")];
}

export function inSeam(slice: SliceInfo, path: string): boolean {
  return matchAny(seamPatterns(slice), path);
}

export function isPure(slice: SliceInfo, path: string): boolean {
  return matchAny(purePatterns(slice), path);
}

/** May a file in layer `from` import one in layer `to`? Unknown layers are never allowed anything. */
export function layerAllows(config: ArchitectureConfig, from: string, to: string): boolean {
  if (from === to) return true;
  return (config.layerMatrix[from] ?? []).includes(to);
}

export function knownLayer(config: ArchitectureConfig, layer: string): boolean {
  return Object.hasOwn(config.layerMatrix, layer);
}
