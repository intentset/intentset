/**
 * The export envelope (spec/export.md; spec/export.schema.json; Core §12).
 * Artifacts are sorted by ID and every list inside is sorted, so the same
 * validation result with the same `generatedAt` is the same bytes. Bodies
 * are included only when asked for.
 *
 * Restricted artifacts are withheld unless asked for, as they are from agent
 * context: absent from `artifacts`, `products` and every report, their IDs
 * removed from the links of what is exported and redacted from diagnostic
 * text, and every omission counted where it happened, so a short export never
 * reads as a complete one. The graph hash still covers them: it names the
 * snapshot, which evidence is bound to, not the projection.
 */
import { graphHash, sortKeysDeep } from "./hash.ts";
import { compareStrings } from "./report.ts";
import {
  type Availability,
  EXPORT_CONTRACT,
  type ExportArtifact,
  type ExportEnvelope,
  type ExportImpactHit,
  type ExportReports,
  LINK_KINDS,
  type Level,
  type LinkKind,
  type Registries,
  SPEC_VERSION,
  type SliceMeta,
  type ValidationResult,
  type Visibility,
} from "./types.ts";
import type { Diagnostic } from "./diagnostics.ts";

/** What the caller knows and the validation result does not: identity, commit, scope, level, release. */
export interface ExportMeta {
  /** Stable identity of the repository, from config. */
  repository: string;
  /** The commit the export describes, or null with `commitUnavailable` saying why (a default reason is written when none is given). */
  commit: string | null;
  commitUnavailable?: string;
  /** True when tracked files differed from the commit. Ignored when the commit is null. */
  uncommitted?: boolean;
  /** The scope globs validated; defaults to every Markdown file. */
  scope?: string[];
  /** The level the validation ran at; defaults to L1. */
  level?: Level;
  release?: { product: string; label: string } | null;
  /** ISO 8601; defaults to now. Fix it to make two exports comparable byte for byte. */
  generatedAt?: string;
  includeBodies?: boolean;
  /** Export restricted artifacts too. Default false: they are withheld and counted (spec/export.md §3). */
  includeRestricted?: boolean;
  /**
   * Report sections, each computed over the whole graph by the package that
   * owns it. The export withholds inside them exactly as it does for artifacts.
   */
  reports?: ExportReports;
}

/** spec/export.md: the `intentset/export/0.3` envelope over a validation result. */
export function exportGraph(result: ValidationResult, registries: Registries, meta: ExportMeta): ExportEnvelope {
  const { graph } = result;
  const withheld = withheldIds(result, meta.includeRestricted === true);
  const ids = [...graph.artifacts.keys()].filter((id) => !withheld.ids.has(id)).sort(compareStrings);
  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = result.diagnostics.length - errors;
  const diagnostics = withholdDiagnostics(result.diagnostics, withheld);
  const source: ExportEnvelope["source"] = { commit: meta.commit, uncommitted: false };
  if (meta.commit === null) {
    source.commitUnavailable = meta.commitUnavailable ?? "No commit was supplied to the export.";
  } else {
    source.uncommitted = meta.uncommitted === true;
  }

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
      diagnostics,
    },
    withholding: {
      visibilities: meta.includeRestricted === true ? [] : ["restricted"],
      artifacts: withheld.ids.size,
      diagnostics: result.diagnostics.length - diagnostics.length,
    },
    registries: exportRegistries(registries, withheld.ids),
    artifacts: ids.map((id) => exportArtifact(result, id, meta.includeBodies === true, withheld.ids)),
    reports: withholdReports(meta.reports ?? {}, withheld.ids),
  };
}

interface Withheld {
  ids: Set<string>;
  /** Source paths of the withheld artifacts, for diagnostics that name a file but no artifact. */
  paths: Set<string>;
  /** Matches any withheld ID as a whole token, or null when nothing is withheld. */
  pattern: RegExp | null;
}

const WITHHELD_VISIBILITIES: readonly Visibility[] = ["restricted"];

function withheldIds(result: ValidationResult, includeRestricted: boolean): Withheld {
  const ids = new Set<string>();
  const paths = new Set<string>();
  if (!includeRestricted) {
    for (const [id, artifact] of result.graph.artifacts) {
      if (WITHHELD_VISIBILITIES.includes(artifact.meta.visibility)) {
        ids.add(id);
        paths.add(artifact.path);
      }
    }
  }
  const alternatives = [...ids].sort((a, b) => b.length - a.length || compareStrings(a, b)).map(escapeRegExp);
  const pattern =
    alternatives.length === 0 ? null : new RegExp(`(?<![A-Z0-9-])(?:${alternatives.join("|")})(?![A-Z0-9-])`, "g");
  return { ids, paths, pattern };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Diagnostics about a withheld artifact are left out; any other that names one has the ID redacted. */
function withholdDiagnostics(diagnostics: readonly Diagnostic[], withheld: Withheld): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const d of diagnostics) {
    if (d.artifact !== null && withheld.ids.has(d.artifact)) continue;
    if (d.path !== null && withheld.paths.has(d.path)) continue;
    const pattern = withheld.pattern;
    if (pattern === null) {
      out.push(d);
      continue;
    }
    const redact = (text: string) => text.replace(pattern, "a withheld artifact");
    out.push({ ...d, message: redact(d.message), remediation: redact(d.remediation) });
  }
  return out;
}

function exportArtifact(
  result: ValidationResult,
  id: string,
  includeBody: boolean,
  withheld: ReadonlySet<string>,
): ExportArtifact {
  const { graph } = result;
  const artifact = graph.artifacts.get(id);
  if (artifact === undefined) throw new Error(`graph has no artifact ${id}`);
  const { meta } = artifact;
  let withheldLinks = 0;
  const keep = (list: Iterable<string>): string[] => {
    const out: string[] = [];
    for (const target of list) {
      if (withheld.has(target)) withheldLinks++;
      else out.push(target);
    }
    return out.sort(compareStrings);
  };

  const links: ExportArtifact["links"] = {};
  for (const kind of LINK_KINDS) {
    if (kind === "parent") continue;
    const list = meta.links[kind];
    if (list !== undefined) links[kind] = keep(list);
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
    if (list !== undefined) {
      const kept = keep(new Set(list));
      if (kept.length > 0) derived[kind] = kept;
    }
  }
  let parent = meta.parent ?? null;
  if (parent !== null && withheld.has(parent)) {
    parent = null;
    withheldLinks++;
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
    parent,
    links,
    derived,
    withheldLinks,
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
    measure:
      meta.measure === undefined
        ? null
        : {
            metric: meta.measure.metric,
            baseline: meta.measure.baseline,
            target: meta.measure.target,
            window: meta.measure.window,
            source: meta.measure.source,
            direction: meta.measure.direction ?? null,
          },
    tips: meta.tips === undefined ? null : (sortKeysDeep(meta.tips) as Record<string, string>),
    extensions: meta.extensions === undefined ? null : (sortKeysDeep(meta.extensions) as Record<string, unknown>),
  };
  if (includeBody) exported.body = artifact.body;
  return exported;
}

/**
 * Each report as its producer computed it, less what is withheld: entries
 * about a withheld artifact go, lists inside an entry lose withheld IDs, and
 * an impact hit whose path passes through a withheld artifact goes too, each
 * counted in the `withheld` beside it.
 */
function withholdReports(reports: ExportReports, withheld: ReadonlySet<string>): ExportReports {
  const out: ExportReports = {};
  const split = (list: readonly string[]): [string[], number] => {
    const kept = list.filter((id) => !withheld.has(id));
    return [kept, list.length - kept.length];
  };
  if (reports.evidence !== undefined) {
    const evidence = reports.evidence;
    out.evidence = {
      ...evidence,
      verifications: evidence.verifications.filter((v) => !withheld.has(v.id)),
      claims: evidence.claims
        .filter((claim) => !withheld.has(claim.id))
        .map((claim) => {
          const [verifications, removed] = split(claim.verifications);
          return { ...claim, verifications, withheld: claim.withheld + removed };
        }),
    };
  }
  if (reports.knowledge !== undefined) {
    out.knowledge = {
      ...reports.knowledge,
      artifacts: reports.knowledge.artifacts
        .filter((entry) => !withheld.has(entry.id))
        .map((entry) => {
          const [sources, a] = split(entry.sources);
          const [changed, b] = split(entry.changed);
          const [missing, c] = split(entry.missing);
          return { ...entry, sources, changed, missing, withheld: entry.withheld + a + b + c };
        }),
    };
  }
  if (reports.impact !== undefined) {
    const visible = (hit: ExportImpactHit) => !withheld.has(hit.id) && hit.path.every((step) => !withheld.has(step.id));
    out.impact = {
      ...reports.impact,
      starts: reports.impact.starts
        .filter((entry) => !withheld.has(entry.start))
        .map((entry) => {
          const direct = entry.direct.filter(visible);
          const candidates = entry.candidates.filter(visible);
          const context = entry.context.filter(visible);
          const [ancestors, removed] = split(entry.ancestors);
          const hits = entry.direct.length + entry.candidates.length + entry.context.length;
          const kept = direct.length + candidates.length + context.length;
          return { ...entry, direct, candidates, context, ancestors, withheld: entry.withheld + hits - kept + removed };
        }),
    };
  }
  if (reports.ownership !== undefined) {
    const files = reports.ownership.files.filter((file) => file.owner === null || !withheld.has(file.owner));
    out.ownership = {
      ...reports.ownership,
      files,
      withheld: reports.ownership.withheld + reports.ownership.files.length - files.length,
    };
  }
  return out;
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
    entrypoints: [...slice.entrypoints].sort(compareStrings),
    layers,
    claims: [...slice.claims]
      .map((claim) => ({ kind: claim.kind, path: claim.path }))
      .sort((a, b) => compareStrings(a.kind, b.kind) || compareStrings(a.path, b.path)),
    usesResources: [...slice.usesResources].sort(compareStrings),
  };
  if (slice.rationale !== undefined) out.rationale = slice.rationale;
  return out;
}

function exportRegistries(registries: Registries, withheld: ReadonlySet<string>): Registries {
  return {
    owners: [...registries.owners].sort(compareStrings),
    audiences: [...registries.audiences].sort(compareStrings),
    releases: [...registries.releases].sort(compareStrings),
    roles: [...registries.roles].sort(compareStrings),
    editions: [...registries.editions].sort(compareStrings),
    flags: [...registries.flags].sort(compareStrings),
    evidenceSources: [...registries.evidenceSources].sort(compareStrings),
    resources: [...registries.resources]
      .map((resource) => ({
        id: resource.id,
        path: resource.path,
        owner: resource.owner,
        consumers: resource.consumers.filter((id) => !withheld.has(id)).sort(compareStrings),
      }))
      .sort((a, b) => compareStrings(a.id, b.id)),
  };
}
