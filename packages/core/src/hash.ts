/**
 * Canonical JSON and SHA-256 (ADR 0005). Everything hashed goes through
 * `canonicalJson`, so the same value is the same bytes on every machine.
 */
import { createHash } from "node:crypto";
import type { Graph, LinkKind } from "./types.ts";

/** ADR 0005: JSON with keys sorted recursively and no whitespace. `undefined` members are omitted, as JSON.stringify omits them. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** ADR 0005: the same value with every object's keys in sorted order, arrays untouched. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) out[key] = sortKeysDeep(record[key]);
    }
    return out;
  }
  return value;
}

/** ADR 0005: lowercase hex SHA-256 of a string's UTF-8 bytes or of raw bytes. */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * ADR 0005: SHA-256 of the canonical JSON of the sorted list of
 * `{ id, type, sourceHash, links }`, where `links` holds the artifact's
 * authored edges by kind (`parent` included) with each target list sorted.
 * Timestamps and commits stay outside, so the same files at two commits hash
 * the same.
 */
export function graphHash(graph: Graph): string {
  const entries = [...graph.artifacts.keys()].sort().map((id) => {
    const artifact = graph.artifacts.get(id);
    if (artifact === undefined) throw new Error(`graph has no artifact ${id}`);
    const links: Partial<Record<LinkKind, string[]>> = {};
    for (const edge of graph.out.get(id) ?? []) {
      const list = links[edge.kind];
      if (list === undefined) links[edge.kind] = [edge.to];
      else list.push(edge.to);
    }
    for (const kind of Object.keys(links) as LinkKind[]) links[kind]?.sort();
    return { id, type: artifact.meta.type, sourceHash: artifact.sourceHash, links };
  });
  return sha256Hex(canonicalJson(entries));
}
