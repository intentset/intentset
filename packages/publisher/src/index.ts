/**
 * @intentset/publisher: the audience and release projection that turns
 * reviewed knowledge into Markset documents with provenance (Core §9,
 * spec/publication.md).
 */
export { bodyLineOffset } from "./body.ts";
export { type Chunk, type ChunkOptions, type ChunkSource, toChunks } from "./chunks.ts";
export {
  type ChangedSinceReview,
  type GenerateOptions,
  type GeneratedDocument,
  type KeptOptions,
  PUBLICATION_KEY,
  PUBLICATION_PROFILE,
  type PublicationMeta,
  type SourceStamp,
  UNDER_REVIEW_DIR,
  UNDER_REVIEW_NOTE,
  checkGenerated,
  generateDocument,
  keptBody,
  keptPublicationMeta,
  markerLine,
  marksetSource,
  publicationMeta,
} from "./generate.ts";
export {
  HELP_FILE,
  HELP_PROFILE,
  type HelpFile,
  type HelpKnowledge,
  type HelpOptions,
  type HelpSurface,
  type HelpTip,
  helpFile,
} from "./help.ts";
export {
  EXCLUSION_REASONS,
  type Exclusion,
  type ExclusionReason,
  type ProjectOptions,
  type Projection,
  type Snapshot,
  audienceReason,
  availabilityReason,
  exclusionReason,
  plannedSources,
  project,
} from "./project.ts";
export {
  type HtmlRendering,
  PUBLICATION_INDEX_PROFILE,
  type PublicationIndex,
  type PublishOptions,
  type PublishResult,
  type PublishedDocument,
  REFUSAL_REASONS,
  type RefusalReason,
  UNDER_REVIEW_FRAGMENT_ATTRIBUTE,
  publish,
  renderDocument,
  renderFragment,
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
  type CheckedRequest,
  type IndexedRequest,
  LIST_DIMENSIONS,
  PROJECTION_ADMITS,
  type PublicationRequest,
  type RequestDimension,
  SINGLE_DIMENSIONS,
  admits,
  checkRequest,
  indexedRequest,
  requestList,
} from "./request.ts";
export {
  CURRENT_PIN,
  KEEP_BLOCKERS,
  type KeepBlocker,
  PIN_KINDS,
  type PinState,
  type PinKind,
  DEFAULT_PIN_KIND,
  type ReviewRecord,
  type ReviewStatus,
  bindReviewPins,
  knowledgeReport,
  pinHash,
  readReviewRecord,
  reviewGateHash,
  reviewSources,
  reviewStatus,
} from "./review.ts";
export {
  type HelpSurfaces,
  OMISSION_REASONS,
  type OmissionReason,
  type OmittedSurface,
  helpSurfaces,
} from "./surfaces.ts";
export { SNAPSHOT_FILE, SNAPSHOT_PROFILE, type SnapshotFile, snapshotFile } from "./snapshot.ts";
export { YamlEmitError, type YamlValue, emitYaml } from "./yaml.ts";
