/**
 * @intentset/publisher: the audience and release projection that turns
 * reviewed knowledge into Markset documents with provenance (Core §9,
 * spec/publication.md).
 */
export { bodyLineOffset } from "./body.ts";
export { type Chunk, type ChunkOptions, type ChunkSource, toChunks } from "./chunks.ts";
export {
  type GenerateOptions,
  type GeneratedDocument,
  PUBLICATION_KEY,
  PUBLICATION_PROFILE,
  type PublicationMeta,
  type SourceStamp,
  checkGenerated,
  generateDocument,
  markerLine,
  marksetSource,
  publicationMeta,
} from "./generate.ts";
export {
  EXCLUSION_REASONS,
  type Exclusion,
  type ExclusionReason,
  type ProjectOptions,
  type Projection,
  type Snapshot,
  exclusionReason,
  project,
} from "./project.ts";
export {
  type PublicationIndex,
  type PublishOptions,
  type PublishResult,
  type PublishedDocument,
  REFUSAL_REASONS,
  type RefusalReason,
  publish,
  renderDocument,
} from "./publish.ts";
export {
  type Reference,
  type ReferenceKind,
  checkReferences,
  checkTitles,
  findReferences,
  resolveTarget,
  titlePattern,
} from "./references.ts";
export {
  type IndexedRequest,
  PROJECTION_ADMITS,
  type PublicationRequest,
  REQUEST_DIMENSIONS,
  type RequestDimension,
  admits,
  checkRequest,
  indexedRequest,
} from "./request.ts";
export {
  CURRENT_PIN,
  REVIEW_EXTENSION,
  type ReviewRecord,
  type ReviewStatus,
  bindReviewPins,
  readReviewRecord,
  reviewSources,
  reviewStatus,
} from "./review.ts";
export { YamlEmitError, type YamlValue, emitYaml } from "./yaml.ts";
