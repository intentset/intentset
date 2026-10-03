/**
 * Loading a repository: the one place the CLI reads the tree. Everything here
 * is a read. The commit comes from `git rev-parse HEAD`, which reads the
 * object store and writes nothing; any failure becomes `commit: null` with
 * the reason, because the export and every report must say which snapshot
 * they describe and a missing commit is a fact to state, not to invent.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  type Config,
  type Diagnostic,
  type DocumentInput,
  EMPTY_REGISTRIES,
  type Registries,
  hasErrors,
  plainCarrier,
  readConfig,
  readRegistries,
} from "@intentset/core";
import { marksetCarrier } from "@intentset/markset-adapter";
import { matchAny } from "./glob.ts";

/** Where the configuration lives, relative to the repository root. Its presence is what makes a directory a root. */
export const CONFIG_PATH = ".intentset/config.yaml";

export const CARRIERS = {
  markset: marksetCarrier,
  plain: plainCarrier,
} as const;
export type CarrierName = keyof typeof CARRIERS;

export interface Repository {
  /** Absolute path of the repository root. */
  root: string;
  config: Config;
  /** One per document in scope, sorted by repository-relative path. */
  inputs: DocumentInput[];
  registries: Registries;
  /** CFG001 from the configuration and CFG002 from the registries, sorted as core sorts. */
  diagnostics: Diagnostic[];
  /** False when the configuration itself has an error: then no scope is known and nothing was enumerated. */
  configOk: boolean;
  commit: string | null;
  commitUnavailable?: string;
}

/**
 * The repository root: `explicit` when given (it must hold the configuration),
 * otherwise the nearest directory at or above `cwd` that does. Null when none.
 */
export function findRoot(cwd: string, explicit: string | undefined): string | null {
  if (explicit !== undefined) {
    const root = resolve(cwd, explicit);
    return existsSync(join(root, CONFIG_PATH)) ? root : null;
  }
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, CONFIG_PATH))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Core §11: read the configuration, the documents in its scope with the chosen carrier, the registries and the commit. */
export function loadRepository(root: string, carrier: CarrierName): Repository {
  const read = readConfig(readFileSync(join(root, CONFIG_PATH), "utf8"), CONFIG_PATH);
  const config = read.config;
  const diagnostics = [...read.diagnostics];
  const configOk = !hasErrors(read.diagnostics);
  const inputs: DocumentInput[] = [];
  let registries: Registries = { ...EMPTY_REGISTRIES, resources: [] };

  if (configOk) {
    const parse = CARRIERS[carrier];
    for (const path of enumerate(root, config)) {
      inputs.push(parse(path, readFileSync(join(root, path), "utf8")));
    }
    if (config.registries !== null) {
      const file = join(root, config.registries);
      const text = isFile(file) ? readFileSync(file, "utf8") : null;
      const loaded = readRegistries(text, config.registries);
      registries = loaded.registries;
      diagnostics.push(...loaded.diagnostics);
    }
  }
  return { root, config, inputs, registries, diagnostics, configOk, ...readCommit(root) };
}

/**
 * Core §11 scope: every regular file under `root` matching a `scope` pattern
 * and no `ignore` pattern, as sorted repository-relative POSIX paths. An
 * ignored directory is not entered. Symbolic links are not followed, so the
 * walk cannot leave the repository or loop.
 */
export function enumerate(root: string, config: Pick<Config, "scope" | "ignore">): string[] {
  const out: string[] = [];
  const walk = (relative: string): void => {
    const entries = readdirSync(relative === "" ? root : join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (matchAny(config.ignore, path)) continue;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && matchAny(config.scope, path)) out.push(path);
    }
  };
  walk("");
  return out.sort(compareStrings);
}

/** The commit at HEAD in `root`, or null and the reason none could be read. */
export function readCommit(root: string): { commit: string | null; commitUnavailable?: string } {
  try {
    const commit = execFileSync("git", ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(commit)) return { commit };
    return { commit: null, commitUnavailable: `git rev-parse printed "${commit}", which is not a commit ID.` };
  } catch (error) {
    return { commit: null, commitUnavailable: commitFailure(error) };
  }
}

function commitFailure(error: unknown): string {
  const failure = error as { code?: string; status?: number | null; stderr?: string };
  if (failure.code === "ENOENT") return "git is not installed, so no commit could be read.";
  const detail = (failure.stderr ?? "").trim().split("\n")[0] ?? "";
  if (/not a git repository/i.test(detail)) return "The repository root is not inside a git repository.";
  if (failure.status === 1 && detail === "") return "The git repository has no commit at HEAD yet.";
  return detail === "" ? "git rev-parse HEAD failed." : `git rev-parse HEAD failed: ${detail}`;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** ADR 0005: code-unit order, the one order everything iterated is sorted by. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
