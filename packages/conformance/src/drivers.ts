/**
 * Section name -> driver. A section present in tests/ but absent here is
 * reported as skipped, so the suite can hold cases for checks that are
 * specified but not yet implemented. `vsa`, `evidence` and `publication` are
 * registered when the architecture, verification and publisher packages land.
 */
import {
  type DocumentInput,
  EMPTY_REGISTRIES,
  type Diagnostic,
  type Registries,
  type ValidationResult,
  exportGraph,
  plainCarrier,
  readConfig,
  readRegistries,
  validate,
} from "@intentset/core";
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
}

function validateTree(expanded: ExpandedCase): Validated {
  const inputs: DocumentInput[] = [];
  for (const [path, source] of expanded.files) {
    if (path.endsWith(".md")) inputs.push(plainCarrier(path, source));
  }

  const extra: Diagnostic[] = [];
  let registries: Registries = EMPTY_REGISTRIES;
  if (expanded.registriesText !== null) {
    const read = readRegistries(expanded.registriesText, REGISTRIES_PATH);
    registries = read.registries;
    extra.push(...read.diagnostics);
  }
  if (expanded.configText !== null) {
    extra.push(...readConfig(expanded.configText, CONFIG_PATH).diagnostics);
  }

  const result = validate(inputs, registries, { level: expanded.level });
  return { result, registries, diagnostics: [...result.diagnostics, ...extra] };
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

export const drivers: Record<string, Driver> = {
  core: coreDriver,
  export: exportDriver,
};
