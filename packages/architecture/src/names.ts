/**
 * Where a name an import takes is defined (VSA006, profile §3, TS004). An
 * entrypoint or a barrel passes names on from other files, and the layer
 * matrix is about the file that defines a name, not the one an import happens
 * to name. So each name is followed through `export ... from`, through
 * `export { a }` of an imported binding, and into `export *`, to the file
 * that declares it.
 *
 * A name a file neither re-exports nor declares, where no `export *` of the
 * file provides it either, is taken as defined in that file: TypeScript
 * refuses a name a module does not export, so this only happens where this
 * reader missed a declaration shape, and it leaves the edge judged as before.
 * A name that may come from a package's `export *` or from an export this
 * reader cannot name (`export =`, `module.exports`) is untraced, and the
 * caller lists it as not checked (invariant 6).
 */
import type { LocalExports } from "./extract.ts";
import type { ImportEdge } from "./imports.ts";
import { compareStrings } from "./patterns.ts";

/** Where one name was found: in a file, in a package, or nowhere this reader can say. */
export type Origin =
  | { kind: "file"; file: string; through: string[] }
  | { kind: "package"; specifier: string; through: string[] }
  | { kind: "untraced"; why: string; through: string[] };

export interface Definition {
  /** The name as the module the edge targets exports it. */
  name: string;
  typeOnly: boolean;
  /** `through` lists the files that passed the name on, the edge's target first; empty when the target declares it. */
  origin: Origin;
}

interface FileTable {
  /** Exported name to the edge and the name it is taken from there. */
  reexports: Map<string, { edge: ImportEdge; name: string }>;
  /** `export * from`, in source order. */
  wildcards: ImportEdge[];
  declared: Set<string>;
  opaque: boolean;
}

/** How many re-exports deep a name is followed before it is called untraced. */
const MAX_DEPTH = 64;

export class NameIndex {
  readonly #tables = new Map<string, FileTable>();
  readonly #all = new Map<string, string[] | null>();

  constructor(edges: readonly ImportEdge[], exports: ReadonlyMap<string, LocalExports>) {
    const imported = new Map<string, Map<string, { edge: ImportEdge; name: string }>>();
    for (const edge of edges) {
      if (edge.dynamic) continue;
      const table = this.#table(edge.from, exports);
      for (const taken of edge.names) {
        if (edge.reexport) {
          if (taken.name === "*" && taken.as === "*") table.wildcards.push(edge);
          else table.reexports.set(taken.as, { edge, name: taken.name });
        } else if (taken.as !== "") {
          const bindings = imported.get(edge.from) ?? new Map();
          bindings.set(taken.as, { edge, name: taken.name });
          imported.set(edge.from, bindings);
        }
      }
    }
    // `export { a }` and `export default a` of an imported binding pass the import on.
    for (const [path, local] of exports) {
      const table = this.#table(path, exports);
      for (const binding of local.bindings) {
        const source = imported.get(path)?.get(binding.name);
        if (source !== undefined) table.reexports.set(binding.as, source);
        else table.declared.add(binding.as);
      }
    }
  }

  #table(path: string, exports: ReadonlyMap<string, LocalExports>): FileTable {
    let table = this.#tables.get(path);
    if (table === undefined) {
      const local = exports.get(path);
      table = {
        reexports: new Map(),
        wildcards: [],
        declared: new Set(local?.declared ?? []),
        opaque: local?.opaque ?? false,
      };
      this.#tables.set(path, table);
    }
    return table;
  }

  /** Where each name `edge` takes is defined, sorted by name. A name of `*` is expanded to every name the target exports. */
  definitions(edge: ImportEdge): Definition[] {
    if (edge.to === null || edge.names.length === 0) return [];
    const to = edge.to;
    const out = new Map<string, Definition>();
    for (const taken of edge.names) {
      const names = taken.name === "*" ? this.#everyName(to, new Set()) : [taken.name];
      if (names === null) {
        out.set("*", {
          name: "*",
          typeOnly: taken.typeOnly,
          origin: { kind: "untraced", why: "it exports names this reader cannot list", through: [to] },
        });
        continue;
      }
      for (const name of names) {
        if (taken.name === "*" && taken.as === "*" && name === "default") continue;
        const typeOnly = taken.typeOnly || edge.typeOnly;
        const known = out.get(name);
        if (known !== undefined && (!known.typeOnly || typeOnly)) continue;
        out.set(name, { name, typeOnly, origin: this.trace(to, name) });
      }
    }
    return [...out.values()].sort((a, b) => compareStrings(a.name, b.name));
  }

  /** Follow one name exported by `file` to the file that defines it. */
  trace(file: string, name: string): Origin {
    const through: string[] = [];
    const seen = new Set<string>();
    let at = file;
    let current = name;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const key = `${at}\u0000${current}`;
      if (seen.has(key)) return { kind: "untraced", why: "its re-exports form a cycle", through };
      seen.add(key);
      const table = this.#tables.get(at);
      if (table === undefined) return { kind: "file", file: at, through };
      const next = table.reexports.get(current);
      if (next !== undefined) {
        through.push(at);
        if (next.edge.to === null) return { kind: "package", specifier: next.edge.specifier, through };
        if (next.name === "*") return { kind: "file", file: next.edge.to, through };
        at = next.edge.to;
        current = next.name;
        continue;
      }
      if (table.declared.has(current)) return { kind: "file", file: at, through };
      if (current !== "default") {
        const provider = table.wildcards.find(
          (edge) => edge.to !== null && this.#provides(edge.to, current, new Set()),
        );
        if (provider !== undefined) {
          through.push(at);
          at = provider.to as string;
          continue;
        }
        for (const edge of table.wildcards) {
          const hidden = edge.to === null ? { package: edge.specifier } : this.#unlisted(edge.to, new Set());
          if (hidden === null) continue;
          through.push(at);
          return "package" in hidden
            ? { kind: "package", specifier: hidden.package, through }
            : { kind: "untraced", why: `${hidden.file} exports names this reader cannot list`, through };
        }
      }
      if (table.opaque) return { kind: "untraced", why: `${at} exports names this reader cannot list`, through };
      return { kind: "file", file: at, through };
    }
    return { kind: "untraced", why: `it is re-exported more than ${MAX_DEPTH} times`, through };
  }

  /** Does `file` export `name`, itself or through `export *`? */
  #provides(file: string, name: string, seen: Set<string>): boolean {
    if (seen.has(file)) return false;
    seen.add(file);
    const table = this.#tables.get(file);
    if (table === undefined) return false;
    if (table.reexports.has(name) || table.declared.has(name)) return true;
    return table.wildcards.some((edge) => edge.to !== null && this.#provides(edge.to, name, seen));
  }

  /** The first package or unreadable file `export *` reaches from `file`, which may hold a name no file here declares. */
  #unlisted(file: string, seen: Set<string>): { package: string } | { file: string } | null {
    if (seen.has(file)) return null;
    seen.add(file);
    const table = this.#tables.get(file);
    if (table === undefined) return null;
    if (table.opaque) return { file };
    for (const edge of table.wildcards) {
      const hidden = edge.to === null ? { package: edge.specifier } : this.#unlisted(edge.to, seen);
      if (hidden !== null) return hidden;
    }
    return null;
  }

  /**
   * Every name `file` exports that some file here defines, sorted, or null when an export cannot be listed. A
   * package's `export *` adds nothing: what a package defines is in no slice's layer.
   */
  #everyName(file: string, seen: Set<string>): string[] | null {
    const cached = this.#all.get(file);
    if (cached !== undefined) return cached;
    if (seen.has(file)) return [];
    seen.add(file);
    const table = this.#tables.get(file);
    if (table === undefined) return [];
    if (table.opaque) return this.#remember(file, null);
    const names = new Set([...table.reexports.keys(), ...table.declared]);
    for (const edge of table.wildcards) {
      if (edge.to === null) continue;
      const more = this.#everyName(edge.to, seen);
      if (more === null) return this.#remember(file, null);
      for (const name of more) if (name !== "default") names.add(name);
    }
    return this.#remember(file, [...names].sort(compareStrings));
  }

  #remember(file: string, names: string[] | null): string[] | null {
    this.#all.set(file, names);
    return names;
  }
}
