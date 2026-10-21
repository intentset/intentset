/**
 * @intentset/architecture: the Traceable VSA checker (spec/vsa-0.2.md) with
 * the TypeScript + Amplify Gen 2 profile's boundaries
 * (spec/profile-typescript-amplify-gen2-0.2.md). `checkArchitecture` is the
 * whole check; the rest is exported for reports, tools and tests.
 */
export { AREA_REVIEW_REQUIRED, areaOf, backendAreaOf, checkAreas, isAreaSchema } from "./areas.ts";
export {
  applyBaseline,
  type BaselineComparison,
  type BaselineEntry,
  baselineKeys,
  type BaselineSubject,
  compareBaselines,
  describeEntry,
  FINGERPRINT_V2,
  fingerprint,
  type Mode,
  parseBaseline,
  plainMessage,
  STALE_ENTRY_CODE,
  staleEntryDiagnostics,
  writeBaseline,
} from "./baseline.ts";
export { type BoundaryResult, checkBoundaries, checkJsx, checkUnclassified, type SliceEdge } from "./boundaries.ts";
export {
  type ArchitectureResult,
  type ArchitectureSummary,
  type CheckOptions,
  checkArchitecture,
  ownershipReport,
  REVIEW_REQUIRED,
} from "./check.ts";
export { checkClaims } from "./claims.ts";
export {
  ARCHITECTURE_CONFIG_PATH,
  type AreaConfig,
  type ArchitectureConfig,
  DEFAULT_ARCHITECTURE_CONFIG,
  MAX_AREAS,
  readArchitectureConfig,
  resolveConfig,
  UI_FRAMEWORKS,
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
export {
  type Extraction,
  extractImports,
  type LocalExports,
  extractSchema,
  findCalls,
  type RawImport,
  SCHEMA_KINDS,
  type SchemaDeclaration,
  type SchemaExtraction,
  type SchemaKind,
  type SchemaReference,
  type TakenName,
} from "./extract.ts";
export type { Finding, SubjectEdge, Taken } from "./finding.ts";
export { buildImportGraph, type ImportEdge, type ImportGraph, takenBy, type UnresolvedImport } from "./imports.ts";
export { type Definition, NameIndex, type Origin } from "./names.ts";
export { fileLayer, inSeam, isPure, layerAllows, layerOf, purePatterns, seamPatterns } from "./layers.ts";
export { checkOwnership } from "./ownership.ts";
export { type ArchitectureSubjectSource, type SubjectSourceOptions, subjectSource } from "./subject-source.ts";
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
