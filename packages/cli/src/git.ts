/**
 * The git reads `review` needs: a base to compare with and the files changed
 * since it. Every call is a read and passes --no-optional-locks, so not even
 * git's own index refresh is written (invariant 7). Paths come back relative
 * to the repository root the CLI is working in, which may be a subdirectory
 * of the git work tree.
 */
import { execFileSync } from "node:child_process";
import { compareStrings } from "@intentset/core";

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["--no-optional-locks", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function paths(out: string | null): string[] {
  return out === null ? [] : out.split("\0").filter((path) => path !== "");
}

export interface Base {
  /** How the base was chosen, for the report: the ref given, "merge-base with main", or "HEAD~1". */
  ref: string;
  commit: string;
}

export interface Changes {
  base: Base | null;
  /** Why there is no base, when there is none. */
  baseUnavailable?: string;
  /** Changed between the base and HEAD, sorted. */
  committed: string[];
  /** Changed in the working tree or index against HEAD, and untracked files .gitignore does not exclude, sorted. */
  uncommitted: string[];
}

/** The commit a ref names, or null. */
export function resolveCommit(root: string, ref: string): string | null {
  const out = git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return out === null || out.trim() === "" ? null : out.trim();
}

/**
 * The base: `given` when there is one (null when it names no commit), else
 * the merge-base with main when that is not HEAD itself, else HEAD~1.
 */
export function chooseBase(root: string, given: string | undefined): Base | null | { unavailable: string } {
  if (given !== undefined) {
    const commit = resolveCommit(root, given);
    return commit === null ? null : { ref: given, commit };
  }
  const head = resolveCommit(root, "HEAD");
  if (head === null) return { unavailable: "the repository has no commit at HEAD" };
  const mergeBase = git(root, ["merge-base", "HEAD", "main"])?.trim();
  if (mergeBase !== undefined && mergeBase !== "" && mergeBase !== head) {
    return { ref: "merge-base with main", commit: mergeBase };
  }
  const parent = resolveCommit(root, "HEAD~1");
  if (parent !== null) return { ref: "HEAD~1", commit: parent };
  return { unavailable: "HEAD has no parent and no merge-base with main differs from it" };
}

export function changedFiles(root: string, base: Base | null): Omit<Changes, "base" | "baseUnavailable"> {
  const committed =
    base === null ? [] : paths(git(root, ["diff", "--relative", "--name-only", "-z", `${base.commit}...HEAD`]));
  const uncommitted = [
    ...paths(git(root, ["diff", "--relative", "--name-only", "-z", "HEAD"])),
    ...paths(git(root, ["ls-files", "-z", "--others", "--exclude-standard"])),
  ];
  return {
    committed: [...new Set(committed)].sort(compareStrings),
    uncommitted: [...new Set(uncommitted)].sort(compareStrings),
  };
}

/**
 * The trailer a commit carries to say it changes a slice's code without
 * changing its behavior: `Intentset-Unchanged: SLICE-A, SLICE-B`. A reviewer
 * reads it in the commit, so the claim is made where it can be questioned.
 */
export const UNCHANGED_TRAILER = "Intentset-Unchanged";

/** The slice IDs named in an Intentset-Unchanged trailer of any commit after the base, sorted. */
export function acknowledgedSlices(root: string, base: Base | null): string[] {
  if (base === null) return [];
  const out = git(root, ["log", `--format=%(trailers:key=${UNCHANGED_TRAILER},valueonly)`, `${base.commit}..HEAD`]);
  if (out === null) return [];
  return [...new Set(out.split(/[\s,]+/).filter((id) => id !== ""))].sort(compareStrings);
}

/**
 * The files that differ between `commit` and the working tree (tracked changes, staged or not, and untracked files
 * .gitignore does not exclude), sorted, as paths relative to the CLI's root; or null when `commit` is not an ancestor of
 * HEAD or git cannot say. One `git diff --name-only`, so the evidence report can list what changed outside every
 * subject (Core §8) without computing anything per file.
 */
export function changedSince(root: string, commit: string): string[] | null {
  if (git(root, ["merge-base", "--is-ancestor", commit, "HEAD"]) === null) return null;
  const diff = git(root, ["diff", "--relative", "--name-only", "-z", commit]);
  if (diff === null) return null;
  const untracked = paths(git(root, ["ls-files", "-z", "--others", "--exclude-standard"]));
  return [...new Set([...paths(diff), ...untracked])].sort(compareStrings);
}

/**
 * The tracked files that differ from HEAD, staged or not, as `git status` lists them; an empty list for a clean
 * tree, and null when this is not a git work tree or git cannot say. Untracked files are not counted: a command that
 * rewrites tracked files asks only that its rewrite be a diff on its own.
 */
export function trackedChanges(root: string): string[] | null {
  const out = git(root, ["status", "--porcelain", "--untracked-files=no", "-z"]);
  if (out === null) return null;
  return out.split("\0").filter((entry) => entry !== "");
}
