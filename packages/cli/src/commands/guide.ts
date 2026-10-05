/**
 * `intentset guide`: print the agent guide for the repository, the text
 * `init` writes to `.intentset/agents.md`, without writing anything. An agent
 * loads the guide this way when the repository has none yet, or to read the
 * one the installed toolchain would write now. The scope is the one the
 * repository's config names, or init's default where there is no config.
 */
import { resolve } from "node:path";
import type { Io } from "../output.ts";
import { findRoot } from "../repository.ts";
import { guideFor } from "./init.ts";

export function guideCommand(options: { root?: string }, io: Io): number {
  const root = findRoot(io.cwd, options.root) ?? resolve(io.cwd, options.root ?? ".");
  io.stdout(guideFor(root));
  return 0;
}
