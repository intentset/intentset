/**
 * Loading a repository: the one place the CLI reads the tree. Everything here
 * is a read. The commit comes from `git rev-parse HEAD`, which reads the
 * object store and writes nothing; any failure becomes `commit: null` with
 * the reason, because the export and every report must say which snapshot
 * they describe and a missing commit is a fact to state, not to invent.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  type Config,
  compareStrings,
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
  /** True when tracked files differ from that commit, so the commit alone does not describe what was read. */
  uncommitted?: boolean;
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
 * Core §11 scope: every file `listFiles` returns that matches a `scope`
 * pattern, as sorted repository-relative POSIX paths.
 */
export function enumerate(root: string, config: Pick<Config, "scope" | "ignore">): string[] {
  return listFiles(root, config.ignore).filter((path) => matchAny(config.scope, path));
}

/**
 * Every regular file under `root` that no `ignore` pattern matches, sorted.
 * In a git repository the list is git's own (`ls-files --cached --others
 * --exclude-standard`): tracked files and untracked ones .gitignore does not
 * exclude, so build output and untracked worktrees stay out. Elsewhere it is
 * a directory walk. Either way symbolic links are left out, so nothing read
 * lies outside the repository, and a tracked file deleted from the working
 * tree is not listed.
 */
export function listFiles(root: string, ignore: readonly string[]): string[] {
  const listed = gitFiles(root) ?? walk(root, ignore);
  const nested = nestedCheckouts(root);
  return listed.filter(
    (path) => !matchAny(ignore, path) && !ignoredDirectory(ignore, path) && !nested(path) && isFile(join(root, path)),
  );
}

/**
 * A directory with its own `.git` is another checkout (a nested repository or
 * a worktree), not part of this one. git lists an untracked worktree's files
 * one by one, so without this a repository with worktrees under it is read
 * twice: Streamlane's `.claude/worktrees` made every package appear twice.
 */
function nestedCheckouts(root: string): (path: string) => boolean {
  const cache = new Map<string, boolean>();
  return (path) => {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      let found = cache.get(dir);
      if (found === undefined) {
        found = existsSync(join(root, dir, ".git"));
        cache.set(dir, found);
      }
      if (found) return true;
    }
    return false;
  };
}

/** True when some directory containing `path` is ignored, as the walk would never have entered it. */
function ignoredDirectory(ignore: readonly string[], path: string): boolean {
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) if (matchAny(ignore, parts.slice(0, i).join("/"))) return true;
  return false;
}

function gitFiles(root: string): string[] | null {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    });
    return [...new Set(out.split("\0").filter((path) => path !== ""))].sort(compareStrings);
  } catch {
    return null;
  }
}

/** Every regular file under `root` that no `ignore` pattern matches, by walking; ignored directories are not entered. */
export function walk(root: string, ignore: readonly string[]): string[] {
  const out: string[] = [];
  const visit = (relative: string): void => {
    const entries = readdirSync(relative === "" ? root : join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (matchAny(ignore, path)) continue;
      if (entry.isDirectory() && existsSync(join(root, path, ".git"))) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) out.push(path);
    }
  };
  visit("");
  return out.sort(compareStrings);
}

/** The commit at HEAD in `root`, or null and the reason none could be read. */
export function readCommit(root: string): { commit: string | null; commitUnavailable?: string; uncommitted?: boolean } {
  try {
    const commit = execFileSync("git", ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(commit)) {
      // --no-optional-locks: asking whether the tree is clean must not refresh git's index either.
      const status = execFileSync("git", ["--no-optional-locks", "status", "--porcelain", "--untracked-files=no"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return status.trim() === "" ? { commit } : { commit, uncommitted: true };
    }
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

/** A regular file, not a symbolic link to one. */
function isFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}
