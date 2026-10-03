/**
 * The export envelope (Core §12; the integration contract; spec/export.schema.json).
 * Artifacts are sorted by ID and every list inside is sorted, so the same
 * validation result with the same `generatedAt` is the same bytes. Bodies
 * are included only when asked for.
 */
import { graphHash, sortKeysDeep } from "./hash.ts";
import { compareStrings } from "./report.ts";
import {
  type Availability,
  EXPORT_CONTRACT,
  type ExportArtifact,
  type ExportEnvelope,
  LINK_KINDS,
  type Level,
  type LinkKind,
  type Registries,
  SPEC_VERSION,
  type SliceMeta,
  type ValidationResult,
} from "./types.ts";

/** What the caller knows and the validation result does not: identity, commit, scope, level, release. */
export interface ExportMeta {
  /** Stable identity of the repository, from config. */
  repository: string;
  /** The commit the export describes, or null with `commitUnavailable` saying why (a default reason is written when none is given). */
  commit: string | null;
  commitUnavailable?: string;
  /** The scope globs validated; defaults to every Markdown file. */
  scope?: string[];
  /** The level the validation ran at; defaults to L1. */
  level?: Level;
  release?: { product: string; label: string } | null;
  /** ISO 8601; defaults to now. Fix it to make two exports comparable byte for byte. */
  generatedAt?: string;
  includeBodies?: boolean;
}

/** Core §12 and the integration contract: the `intentset/export/0.1` envelope over a validation result. */
export function exportGraph(result: ValidationResult, registries: Registries, meta: ExportMeta): ExportEnvelope {
  const { graph } = result;
  const ids = [...graph.artifacts.keys()].sort(compareStrings);
  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = result.diagnostics.length - errors;
  const source: ExportEnvelope["source"] = { commit: meta.commit };
  if (meta.commit === null)
    source.commitUnavailable = meta.commitUnavailable ?? "No commit was supplied to the export.";

  return {
    contract: EXPORT_CONTRACT,
    spec: SPEC_VERSION,
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    repository: meta.repository,
    products: ids.filter((id) => graph.artifacts.get(id)?.meta.type === "product"),
    source,
    graphHash: graphHash(graph),
    release: meta.release ?? null,
    validation: {
      level: meta.level ?? "L1",
      scope: [...(meta.scope ?? ["**/*.md"])],
      status: result.ok ? "pass" : "fail",
      errors,
      warnings,
      diagnostics: [...result.diagnostics],
    },
    registries: exportRegistries(registries),
    artifacts: ids.map((id) => exportArtifact(result, id, meta.includeBodies === true)),
  };
}

function exportArtifact(result: ValidationResult, id: string, includeBody: boolean): ExportArtifact {
  const { graph } = result;
  const artifact = graph.artifacts.get(id);
  if (artifact === undefined) throw new Error(`graph has no artifact ${id}`);
  const { meta } = artifact;

  const links: ExportArtifact["links"] = {};
  for (const kind of LINK_KINDS) {
    if (kind === "parent") continue;
    const list = meta.links[kind];
    if (list !== undefined) links[kind] = [...list].sort(compareStrings);
  }
  const derived: ExportArtifact["derived"] = {};
  const byKind = new Map<LinkKind, string[]>();
  for (const edge of graph.in.get(id) ?? []) {
    const list = byKind.get(edge.kind);
    if (list === undefined) byKind.set(edge.kind, [edge.from]);
    else list.push(edge.from);
  }
  for (const kind of LINK_KINDS) {
    const list = byKind.get(kind);
    if (list !== undefined) derived[kind] = [...new Set(list)].sort(compareStrings);
  }

  const exported: ExportArtifact = {
    id,
    type: meta.type,
    title: meta.title,
    status: meta.status,
    owner: meta.owner,
    visibility: meta.visibility,
    audiences: [...meta.audiences].sort(compareStrings),
    profile: meta.profile,
    revision: meta.revision ?? null,
    path: artifact.path,
    sourceHash: artifact.sourceHash,
    parent: meta.parent ?? null,
    links,
    derived,
    availability: meta.availability === undefined ? null : sortedAvailability(meta.availability),
    slice: meta.slice === undefined ? null : sortedSlice(meta.slice),
    verification:
      meta.verification === undefined
        ? null
        : {
            method: meta.verification.method,
            locator: meta.verification.locator,
            selector: meta.verification.selector,
          },
    extensions: meta.extensions === undefined ? null : (sortKeysDeep(meta.extensions) as Record<string, unknown>),
  };
  if (includeBody) exported.body = artifact.body;
  return exported;
}

function sortedAvailability(availability: Availability): Availability {
  return {
    products: [...availability.products].sort(compareStrings),
    releases: [...availability.releases].sort(compareStrings),
    roles: [...availability.roles].sort(compareStrings),
    editions: [...availability.editions].sort(compareStrings),
    flags: [...availability.flags].sort(compareStrings),
  };
}

function sortedSlice(slice: SliceMeta): SliceMeta {
  const layers: Record<string, string[]> = {};
  for (const layer of Object.keys(slice.layers).sort(compareStrings)) {
    layers[layer] = [...slice.layers[layer]].sort(compareStrings);
  }
  const out: SliceMeta = {
    kind: slice.kind,
    domain: slice.domain,
    entrypoint: slice.entrypoint,
    layers,
    claims: [...slice.claims]
      .map((claim) => ({ kind: claim.kind, path: claim.path }))
      .sort((a, b) => compareStrings(a.kind, b.kind) || compareStrings(a.path, b.path)),
    usesResources: [...slice.usesResources].sort(compareStrings),
  };
  if (slice.rationale !== undefined) out.rationale = slice.rationale;
  return out;
}

function exportRegistries(registries: Registries): Registries {
  return {
    owners: [...registries.owners].sort(compareStrings),
    audiences: [...registries.audiences].sort(compareStrings),
    releases: [...registries.releases].sort(compareStrings),
    roles: [...registries.roles].sort(compareStrings),
    editions: [...registries.editions].sort(compareStrings),
    flags: [...registries.flags].sort(compareStrings),
    resources: [...registries.resources]
      .map((resource) => ({
        id: resource.id,
        path: resource.path,
        owner: resource.owner,
        consumers: [...resource.consumers].sort(compareStrings),
      }))
      .sort((a, b) => compareStrings(a.id, b.id)),
  };
}
