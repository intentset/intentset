/**
 * @intentset/cli as a library: `main` for running the command in-process,
 * and the repository loader and pattern matcher it is built on.
 */
export { main, USAGE } from "./main.ts";
export type { Io } from "./output.ts";
export { matchAny, matchGlob } from "./glob.ts";
export { CONFIG_PATH, enumerate, findRoot, loadRepository, readCommit, type Repository } from "./repository.ts";
