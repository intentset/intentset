/**
 * The resolved import graph of a tree (VSA003–VSA006, profile TS004): one
 * edge per module reference in every code file, with the target file or,
 * for a package outside the repository, the specifier alone. What could not
 * be read or resolved is returned beside the edges, never folded into them.
 */
import { extractImports } from "./extract.ts";
import { isCode } from "./paths.ts";
import { compareStrings } from "./patterns.ts";
import type { Resolver, Via } from "./resolve.ts";

export interface ImportEdge {
  from: string;
  /** Target file, or null for an external package. */
  to: string | null;
  specifier: string;
  /** 1-based line of the specifier in `from`. */
  line: number;
  typeOnly: boolean;
  dynamic: boolean;
  reexport: boolean;
  /** `export * from` or `export * as ns from`. */
  wildcardExport: boolean;
  via: Via;
  /** Resolved through a `*` alias, an exports pattern or a package without exports (TS006). */
  wildcardAlias: boolean;
}

export interface UnresolvedImport {
  path: string;
  line: number | null;
  specifier: string | null;
  message: string;
}

export interface ImportGraph {
  edges: ImportEdge[];
  unresolved: UnresolvedImport[];
}

/** Build the graph over every code file in `files` (already filtered of ignored paths). */
export function buildImportGraph(files: ReadonlyMap<string, string>, resolver: Resolver): ImportGraph {
  const edges: ImportEdge[] = [];
  const unresolved: UnresolvedImport[] = [];
  for (const path of [...files.keys()].sort(compareStrings)) {
    if (!isCode(path)) continue;
    const { imports, problems } = extractImports(path, files.get(path) as string);
    for (const problem of problems) {
      unresolved.push({ path, line: problem.line, specifier: null, message: problem.message });
    }
    for (const raw of imports) {
      const resolution = resolver.resolve(path, raw.specifier);
      if (resolution.problem !== undefined) {
        unresolved.push({
          path,
          line: raw.line,
          specifier: raw.specifier,
          message: `the specifier "${raw.specifier}" ${resolution.problem}`,
        });
        continue;
      }
      edges.push({
        from: path,
        to: resolution.to,
        specifier: raw.specifier,
        line: raw.line,
        typeOnly: raw.typeOnly,
        dynamic: raw.dynamic,
        reexport: raw.reexport,
        wildcardExport: raw.wildcard,
        via: resolution.via,
        wildcardAlias: resolution.wildcard,
      });
    }
  }
  return { edges, unresolved };
}
