/**
 * TypeScript 7's scanner, loaded on first use rather than when this package
 * is imported. `typescript` is a peer dependency, and a package manager that
 * resolves peers to the repository's own copy (pnpm) gives this package
 * whatever TypeScript the repository has: on one earlier than 7 the modules
 * below do not exist. Loading them at import time made every `intentset`
 * command fail there, `init` and `validate` included, with a raw module
 * resolution error. Loading them here, when a check first needs them, lets
 * the rest of the toolchain run, and the one check that needs the scanner
 * fails with a `TypeScriptMissingError` that names the TypeScript found, so
 * the CLI can say what to run instead.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type Ast = typeof import("typescript/unstable/ast");
type Scanner = typeof import("typescript/unstable/ast/scanner");

/** Thrown by the first check that needs the scanner when `typescript/unstable/ast` cannot be loaded. */
export class TypeScriptMissingError extends Error {
  /** The version of the `typescript` this package resolves, or null when none does. */
  readonly found: string | null;

  constructor(found: string | null, cause: unknown) {
    super(
      found === null
        ? "The architecture check needs TypeScript 7, and no `typescript` resolves from @intentset/architecture."
        : `The architecture check needs TypeScript 7, and the \`typescript\` that resolves from @intentset/architecture is ${found}.`,
      { cause },
    );
    this.name = "TypeScriptMissingError";
    this.found = found;
  }
}

const require = createRequire(import.meta.url);

/**
 * One of TypeScript's modules, found as an import would find it (so a repository's module resolution, hooks
 * included, decides what `typescript` is here) and loaded synchronously, since the scanner is used that way.
 */
function load<T>(id: string): T {
  return require(fileURLToPath(import.meta.resolve(id))) as T;
}

/** The version of the `typescript` this package resolves, or null when none does. */
export function typescriptVersion(): string | null {
  try {
    return load<{ version: string }>("typescript/package.json").version;
  } catch {
    return null;
  }
}

let loaded: { ast: Ast; scanner: Scanner } | undefined;

/** The scanner's modules, loaded once. */
export function typescript(): { ast: Ast; scanner: Scanner } {
  if (loaded === undefined) {
    try {
      loaded = { ast: load<Ast>("typescript/unstable/ast"), scanner: load<Scanner>("typescript/unstable/ast/scanner") };
    } catch (error) {
      throw new TypeScriptMissingError(typescriptVersion(), error);
    }
  }
  return loaded;
}
