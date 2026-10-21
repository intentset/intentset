/**
 * The resolved import graph of a tree (VSA003–VSA006, profile TS004): one
 * edge per module reference in every code file, with the target file or,
 * for a package outside the repository, the specifier alone. What could not
 * be read or resolved is returned beside the edges, never folded into them.
 */
import { extractImports, type LocalExports, type TakenName } from "./extract.ts";
import type { Taken } from "./finding.ts";
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
  /** The names it takes from the target (`RawImport.names`). */
  names: TakenName[];
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
  /** What each code file exports of its own, by path. */
  exports: Map<string, LocalExports>;
  /** The line of the first JSX element in each file that renders one, by path. */
  jsx: Map<string, number>;
}

/** Build the graph over every code file in `files` (already filtered of ignored paths). */
export function buildImportGraph(files: ReadonlyMap<string, string>, resolver: Resolver): ImportGraph {
  const edges: ImportEdge[] = [];
  const unresolved: UnresolvedImport[] = [];
  const exported = new Map<string, LocalExports>();
  const rendered = new Map<string, number>();
  for (const path of [...files.keys()].sort(compareStrings)) {
    if (!isCode(path)) continue;
    const { imports, problems, exports, jsx } = extractImports(path, files.get(path) as string);
    exported.set(path, exports);
    if (jsx !== null) rendered.set(path, jsx);
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
        names: raw.names,
      });
    }
  }
  return { edges, unresolved, exports: exported, jsx: rendered };
}

/** The import as a baseline identifies it (VSA §9): one entry per name it takes. */
export function takenBy(edge: ImportEdge): Taken {
  const names = edge.names.map((taken) => `${taken.typeOnly || edge.typeOnly ? "type " : ""}${taken.name}`);
  return {
    kind: edge.reexport ? "re-export" : edge.dynamic ? "dynamic" : "import",
    to: edge.to ?? edge.specifier,
    names: [...new Set(names)].sort(compareStrings),
  };
}
