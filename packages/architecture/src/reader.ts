/**
 * A reader: the part of the check that knows one language (ADR 0030). It answers three questions about a tree and
 * nothing else: which files are source, which files each imports and which names it takes, and which file each
 * specifier resolves to. Everything else in this package reads the graph a reader returns and never looks at syntax.
 *
 * A reader reads source files and the data files that configure resolution. It never runs the repository's code,
 * its build scripts or its tools (design invariant 7). What it cannot follow it returns as unresolved, with the
 * reason, and the check reports it as not checked: a reader may be approximate, and it may not guess (invariant 6).
 *
 * The interface is internal to this package. It is how Intentset adds a language, not a way for a repository to.
 */
import type { ArchitectureConfig } from "./config.ts";
import { extractImports } from "./extract.ts";
import { buildImportGraph, type ImportGraph } from "./imports.ts";
import { isCode } from "./paths.ts";
import { Resolver } from "./resolve.ts";

/** Something a reader could not do with a file that configures resolution, such as a manifest that does not parse. */
export interface ReaderNote {
  path: string;
  message: string;
}

/** What a reader says about one tree. Each answer is computed when it is first asked for. */
export interface Reading {
  /** Every reference in the tree's source files, resolved, with what could not be read or resolved beside it. */
  graph(): ImportGraph;
  /** What reading the tree's configuration could not do, as far as the questions asked so far have needed it. */
  notes(): ReaderNote[];
  /** The files of the tree that `path` imports. A reference that does not resolve to one is left out. */
  importsOf(path: string): string[];
  /** The configured name a relative import of `to` from `from` could have been written as, or null. */
  aliasFor(from: string, to: string): string | null;
}

export interface Reader {
  /** The language it reads, as a profile names it. */
  language: string;
  /** How the check reports a reference this reader could not follow: its language's code and what to do. */
  unresolved: { code: string; remediation: string };
  /** A file whose imports this reader reads. */
  isSource(path: string): boolean;
  /** Read a tree, already filtered of ignored paths. */
  read(files: ReadonlyMap<string, string>, config: Pick<ArchitectureConfig, "conditions">): Reading;
}

/** TypeScript and JavaScript, read with the TypeScript compiler's scanner and resolved from tsconfig and manifests. */
export const typescriptReader: Reader = {
  language: "typescript",
  unresolved: {
    code: "TS004",
    remediation:
      "Use a literal specifier that resolves to a file in the repository or to a package, so the boundary can be checked (TS004).",
  },
  isSource: isCode,
  read(files, config) {
    let opened: Resolver | null = null;
    const resolver = () => {
      opened ??= new Resolver(files, config);
      return opened;
    };
    return {
      graph: () => buildImportGraph(new Map([...files].filter(([path]) => isCode(path))), resolver()),
      notes: () => [...resolver().tsconfigs.notes, ...resolver().notes],
      importsOf(path) {
        const text = files.get(path);
        if (text === undefined || !isCode(path)) return [];
        const targets: string[] = [];
        for (const raw of extractImports(path, text).imports) {
          const resolution = resolver().resolve(path, raw.specifier);
          if (resolution.problem === undefined && resolution.to !== null) targets.push(resolution.to);
        }
        return targets;
      },
      aliasFor: (from, to) => resolver().aliasFor(from, to),
    };
  },
};

/** The readers this release ships, by language. */
export const READERS: readonly Reader[] = [typescriptReader];
