/**
 * Explicit outputs (`graph --out`, `architecture check --write-baseline`,
 * `evidence import --out`, `publish --out`) may write only what they are
 * named to write, and never a file the repository is made of: a document in
 * scope, the configuration, the registries, the architecture configuration
 * or an exception record, a source file, a manifest. Tools never rewrite
 * those (invariant 1). A target outside the repository is the caller's
 * business.
 */
import { existsSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { ARCHITECTURE_CONFIG_PATH, EXCEPTIONS_PATTERNS } from "@intentset/architecture";
import { matchAny } from "./glob.ts";
import { CONFIG_PATH, type Repository } from "./repository.ts";

const SOURCE = /\.(?:[cm]?[jt]sx?|md|ya?ml)$/;
const MANIFEST = /(?:^|\/)(?:package\.json|tsconfig[^/]*\.json)$/;

/** The target as a repository-relative POSIX path, "" for the root itself, or null when it lies outside the root. */
export function insideRoot(root: string, target: string): string | null {
  const path = relative(root, target);
  if (path === "") return "";
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) return null;
  return path.split(sep).join("/");
}

/**
 * Why `target` (absolute) may not be written, or null when it may. A document
 * that would land in scope is refused even when it does not exist yet, since
 * the next run would read it as canonical.
 */
export function outputProblem(repo: Repository, target: string): string | null {
  const path = insideRoot(repo.root, target);
  if (path === null) return null;
  if (path === "") return "is the repository root";
  const reads = new Set([
    CONFIG_PATH,
    ARCHITECTURE_CONFIG_PATH,
    ...(repo.config.registries === null ? [] : [repo.config.registries]),
    ...repo.inputs.map((input) => input.path),
  ]);
  if (reads.has(path) || matchAny(EXCEPTIONS_PATTERNS, path)) return "is a file the repository reads";
  if (matchAny(repo.config.scope, path) && !matchAny(repo.config.ignore, path)) {
    return "is inside the documents' scope, where it would be read as canonical";
  }
  if (existsSync(target) && (SOURCE.test(path) || MANIFEST.test(path))) return "is a source file or manifest";
  return null;
}

/**
 * Why a directory may not receive generated output, or null when it may: it
 * is the root, or a Markdown file written into it would fall inside the
 * documents' scope, where generated files would sooner or later be read as
 * canonical. An ignored directory, such as dist/, is the place for them.
 */
export function outputDirProblem(repo: Repository, dir: string): string | null {
  const path = insideRoot(repo.root, dir);
  if (path === null) return null;
  if (path === "") return "is the repository root";
  const probe = `${path}/generated.md`;
  if (matchAny(repo.config.scope, probe) && !matchAny(repo.config.ignore, probe)) {
    return "is inside the documents' scope; write generated output to an ignored directory such as dist/";
  }
  return null;
}
