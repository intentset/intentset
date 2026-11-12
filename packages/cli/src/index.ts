/**
 * @intentset/cli as a library: `main` for running the command in-process,
 * the agent guide `init` writes (intentset.org serves it from the same
 * generator), and the repository loader and pattern matcher it is built on.
 */
export { main, USAGE } from "./main.ts";
export { AGENT_GUIDE_PATH, AGENT_POINTERS, agentGuide, type PackageManager } from "./agents.ts";
export type { Io } from "./output.ts";
export { matchAny, matchGlob } from "./glob.ts";
/** @deprecated Moved to `@intentset/core` in 0.11.0 (ADR 0016); import them from there. Re-exported until 0.12. */
export { activeSlices, claimingSlices, describingRecords, isSliceCode } from "./slices.ts";
export { CONFIG_PATH, enumerate, findRoot, loadRepository, readCommit, type Repository } from "./repository.ts";
