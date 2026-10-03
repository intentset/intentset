/**
 * @intentset/architecture: the Traceable VSA checker (spec/vsa-0.1.md) with
 * the TypeScript + Amplify Gen 2 profile's boundaries
 * (spec/profile-typescript-amplify-gen2-0.1.md). `checkArchitecture` is the
 * whole check; the rest is exported for reports, tools and tests.
 */
export {
  applyBaseline,
  type BaselineEntry,
  fingerprint,
  type Mode,
  parseBaseline,
  plainMessage,
  writeBaseline,
} from "./baseline.ts";
export { type BoundaryResult, checkBoundaries, checkUnclassified, type SliceEdge } from "./boundaries.ts";
export {
  type ArchitectureResult,
  type ArchitectureSummary,
  type CheckOptions,
  checkArchitecture,
  REVIEW_REQUIRED,
} from "./check.ts";
export { checkClaims } from "./claims.ts";
export {
  ARCHITECTURE_CONFIG_PATH,
  type ArchitectureConfig,
  DEFAULT_ARCHITECTURE_CONFIG,
  readArchitectureConfig,
  resolveConfig,
} from "./config.ts";
export { checkDependencies, shortestCycle, stronglyConnected } from "./dependencies.ts";
export {
  annotate,
  applyExceptions,
  covers,
  EXCEPTIONS_PATTERNS,
  type ExceptionRecord,
  readExceptionRecord,
  readExceptions,
} from "./exceptions.ts";
export { type Extraction, extractImports, type RawImport } from "./extract.ts";
export type { Finding, SubjectEdge } from "./finding.ts";
export { buildImportGraph, type ImportEdge, type ImportGraph, type UnresolvedImport } from "./imports.ts";
export { inSeam, isPure, layerAllows, layerOf, purePatterns, seamPatterns } from "./layers.ts";
export { checkOwnership } from "./ownership.ts";
export { expandClaims, matchAny, matchPattern, validatePattern } from "./patterns.ts";
export {
  activeSlices,
  buildModel,
  type Model,
  type Region,
  type RegionKind,
  regionLabel,
  type SliceInfo,
} from "./regions.ts";
export { type Resolution, Resolver, type Via } from "./resolve.ts";
export { matchAlias, stripJsonComments, type TsConfig, TsConfigs } from "./tsconfig.ts";
