/**
 * Section name -> driver. A section present in tests/ but absent here is
 * reported as skipped, so the suite can hold cases for checks that are
 * specified but not yet implemented.
 */
import {
  type DocumentInput,
  EMPTY_REGISTRIES,
  type Config,
  type Diagnostic,
  type Registries,
  type ValidationResult,
  exportGraph,
  graphHash,
  plainCarrier,
  readConfig,
  readRegistries,
  validate,
} from "@intentset/core";
import { checkArchitecture, subjectSource } from "@intentset/architecture";
import { marksetCarrier } from "@intentset/markset-adapter";
import { type PublicationRequest, bindReviewPins, publish } from "@intentset/publisher";
import { checkFixtureEvidence, hasSliceClaims, resolveBinding } from "@intentset/verification";
import { CONFIG_PATH, REGISTRIES_PATH } from "./fixtures.ts";
import type { Actual, Driver, ExpandedCase } from "./types.ts";

/**
 * Fixed export metadata, so an envelope is the same bytes on every run and
 * on every machine: a case may then pin any field of it, including the hash.
 */
export const FIXTURE_META = {
  repository: "example/scheduling",
  commit: null,
  commitUnavailable: "fixture",
  generatedAt: "2026-01-01T00:00:00Z",
} as const;

interface Validated {
  result: ValidationResult;
  registries: Registries;
  diagnostics: Diagnostic[];
  /** `evidence:` of the case's configuration; its defaults when the case has none. */
  evidence: Config["evidence"];
}

function validateTree(expanded: ExpandedCase): Validated {
  // A case names the Markset carrier when it is about what Markset reports; the
  // rest read plainly, so their diagnostics are Intentset's alone.
  const carrier = expanded.carrier === "markset" ? marksetCarrier : plainCarrier;
  const inputs: DocumentInput[] = [];
  for (const [path, source] of expanded.files) {
    if (path.endsWith(".md")) inputs.push(carrier(path, source));
  }

  const extra: Diagnostic[] = [];
  let evidence: Config["evidence"] = { binding: null, globalInputs: [] };
  let registries: Registries = EMPTY_REGISTRIES;
  if (expanded.registriesText !== null) {
    const read = readRegistries(expanded.registriesText, REGISTRIES_PATH);
    registries = read.registries;
    extra.push(...read.diagnostics);
  }
  if (expanded.configText !== null) {
    const config = readConfig(expanded.configText, CONFIG_PATH);
    extra.push(...config.diagnostics);
    evidence = config.config.evidence;
  }

  const result = validate(inputs, registries, { level: expanded.level });
  return { result, registries, diagnostics: [...result.diagnostics, ...extra], evidence };
}

/** Core checks, L1 and the level the case names: valid, diagnostics, artifacts. */
export const coreDriver: Driver = (expanded) => {
  const { result, diagnostics } = validateTree(expanded);
  return {
    valid: !diagnostics.some((d) => d.severity === "error"),
    diagnostics,
    artifacts: [...result.graph.artifacts.keys()].sort(),
  } satisfies Actual;
};

/** The export envelope over the same validation, with fixture metadata. */
export const exportDriver: Driver = (expanded) => {
  const { result, registries, diagnostics } = validateTree(expanded);
  return {
    valid: !diagnostics.some((d) => d.severity === "error"),
    diagnostics,
    artifacts: [...result.graph.artifacts.keys()].sort(),
    export: exportGraph(result, registries, FIXTURE_META),
  } satisfies Actual;
};

/**
 * Evidence over the same validation (Core §8): run records bound to the case's
 * snapshot through the `@current` placeholder, classified, and CORE007 at L3+.
 */
export const evidenceDriver: Driver = (expanded) => {
  const { result, registries, diagnostics, evidence } = validateTree(expanded);
  // Under subject binding the subjects are computed over the tree of the case's documents and sources, with
  // the architecture package's resolution of claims and imports (Core §8).
  const files = new Map([...expanded.files, ...expanded.sources]);
  const subject =
    resolveBinding(evidence.binding, hasSliceClaims(result.graph)).binding === "subject"
      ? subjectSource(
          result.graph,
          registries,
          { files },
          {
            globalInputs: evidence.globalInputs,
            readFile: (path) => (files.has(path) ? Buffer.from(files.get(path) as string) : undefined),
          },
        )
      : undefined;
  const run = checkFixtureEvidence({
    graph: result.graph,
    level: expanded.level,
    evidence: expanded.evidence,
    request: expanded.request,
    documents: expanded.files.keys(),
    sources: expanded.sources.keys(),
    configuredBinding: evidence.binding,
    changedSince: expanded.changedSince,
    ...(subject === undefined ? {} : { subjectSource: subject }),
  });
  const all = [...diagnostics, ...run.diagnostics];
  return {
    valid: !all.some((d) => d.severity === "error"),
    diagnostics: all,
    artifacts: [...result.graph.artifacts.keys()].sort(),
  } satisfies Actual;
};

/** The fixed publication time, so a published document is the same bytes on every run. */
export const FIXTURE_PUBLISHED_AT = "2026-01-01T00:00:00Z";

/**
 * Publication over the same validation (Core §9): review pins written as
 * `@current` bound to the patched sources, then the case's request published
 * with HTML, and every byte written or reported offered to `mustContain` and
 * `mustNotContain`.
 */
export const publicationDriver: Driver = (expanded) => {
  const { result, registries, diagnostics } = validateTree(expanded);
  const graph = bindReviewPins(result.graph);
  const published = publish(graph, registries, (expanded.request ?? {}) as unknown as PublicationRequest, {
    snapshot: { commit: null, graphHash: graphHash(graph) },
    publishedAt: FIXTURE_PUBLISHED_AT,
    renderHtml: true,
  });
  const all = [...diagnostics, ...published.diagnostics];
  const text = [
    ...published.documents.flatMap((document) => [document.markset, document.html ?? ""]),
    JSON.stringify(published.index),
    JSON.stringify(published.help),
    JSON.stringify(published.diagnostics),
  ].join("\n");
  return {
    valid: !all.some((d) => d.severity === "error"),
    diagnostics: all,
    artifacts: [...graph.artifacts.keys()].sort(),
    published: { ids: published.index.published, text },
  } satisfies Actual;
};

/** The day exceptions expire against in fixtures, so an expiry case reads the same on every run. */
export const FIXTURE_TODAY = "2026-10-02";

/**
 * Traceable VSA over the same validation: every file of the case, documents
 * included since a claim may name one, plus its sources, as one tree.
 */
export const vsaDriver: Driver = (expanded) => {
  const { result, registries, diagnostics } = validateTree(expanded);
  const files = new Map([...expanded.files, ...expanded.sources]);
  const architecture = checkArchitecture(
    result.graph,
    registries,
    { files },
    {
      level: expanded.level,
      today: FIXTURE_TODAY,
    },
  );
  const all = [...diagnostics, ...architecture.diagnostics];
  return {
    valid: !all.some((d) => d.severity === "error"),
    diagnostics: all,
    artifacts: [...result.graph.artifacts.keys()].sort(),
  } satisfies Actual;
};

export const drivers: Record<string, Driver> = {
  core: coreDriver,
  evidence: evidenceDriver,
  export: exportDriver,
  publication: publicationDriver,
  vsa: vsaDriver,
};
