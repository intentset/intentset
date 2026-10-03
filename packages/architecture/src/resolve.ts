/**
 * Module resolution over an in-memory tree (profile TS002, TS004–TS006).
 *
 * A specifier resolves, in order, as: a relative path against the importing
 * file; an alias from the nearest tsconfig's `paths`; a path under its
 * `baseUrl`; a workspace package whose package.json is in the tree; or an
 * external package, which is outside the repository and ignored. A specifier
 * that is none of these is a problem the caller reports, never a silent miss.
 *
 * File probes follow TypeScript: `./x.js` tries `./x.ts` and `./x.tsx` first,
 * then the exact file, then `x` plus each code extension, then `x/index.*`.
 * A workspace package's entry is its `exports` (the configured conditions,
 * then types, import, default), then `types`, then `main`; nothing is
 * guessed, so a package that exports only built output that is not in the
 * tree is a problem until a source condition is configured.
 */
import type { ArchitectureConfig } from "./config.ts";
import { basename, dirname, joinPath } from "./paths.ts";
import { compareStrings } from "./patterns.ts";
import { matchAlias, TsConfigs } from "./tsconfig.ts";

export type Via = "relative" | "alias" | "baseUrl" | "workspace" | "package";

export interface Resolution {
  /** Repository path of the target, or null for an external package or a problem. */
  to: string | null;
  via: Via;
  /** True when a wildcard opened the path: a `*` alias, an exports pattern, or a package without exports. */
  wildcard: boolean;
  /** Why the specifier could not be resolved; absent when it resolved or is an external package. */
  problem?: string;
}

interface WorkspacePackage {
  name: string;
  dir: string;
  manifest: Record<string, unknown>;
}

const JS_REWRITES: [string, string[]][] = [
  [".js", [".ts", ".tsx", ".d.ts"]],
  [".jsx", [".tsx"]],
  [".mjs", [".mts", ".d.mts"]],
  [".cjs", [".cts", ".d.cts"]],
];
const APPENDED = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
const INDEXES = ["index.ts", "index.tsx", "index.d.ts", "index.js", "index.jsx"];

/** A bare specifier that npm or node could serve: `name`, `name/sub`, `@scope/name/sub`, `node:fs`. */
const PACKAGE_NAME = /^(?:node:)?(?:@[a-z0-9][\w.~-]*\/)?[a-z0-9][\w.~-]*(?:\/.*)?$/i;

export class Resolver {
  readonly tsconfigs: TsConfigs;
  readonly notes: { path: string; message: string }[] = [];
  private readonly files: ReadonlyMap<string, string>;
  private readonly conditions: string[];
  private readonly packages: WorkspacePackage[] = [];

  constructor(files: ReadonlyMap<string, string>, config: Pick<ArchitectureConfig, "conditions">) {
    this.files = files;
    this.tsconfigs = new TsConfigs(files);
    this.conditions = [...config.conditions, "types", "import", "default", "require", "node"];
    const seen = new Set<string>();
    for (const path of [...files.keys()].sort(compareStrings)) {
      if (basename(path) !== "package.json") continue;
      let manifest: unknown;
      try {
        manifest = JSON.parse(files.get(path) as string);
      } catch (error) {
        this.notes.push({
          path,
          message: `does not parse (${(error as Error).message}), so its package cannot be resolved`,
        });
        continue;
      }
      if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) continue;
      const name = (manifest as Record<string, unknown>).name;
      if (typeof name !== "string" || name === "") continue;
      if (seen.has(name)) {
        this.notes.push({ path, message: `declares package ${name} a second time; the first, by path, is used` });
        continue;
      }
      seen.add(name);
      this.packages.push({ name, dir: dirname(path), manifest: manifest as Record<string, unknown> });
    }
    this.packages.sort((a, b) => b.name.length - a.name.length || compareStrings(a.name, b.name));
  }

  /** The first existing file a module path names. */
  probe(base: string): string | null {
    const has = (path: string) => this.files.has(path);
    for (const [extension, alternatives] of JS_REWRITES) {
      if (!base.endsWith(extension)) continue;
      const stem = base.slice(0, -extension.length);
      for (const alternative of alternatives) if (has(stem + alternative)) return stem + alternative;
    }
    if (has(base)) return base;
    for (const extension of APPENDED) if (has(base + extension)) return base + extension;
    for (const index of INDEXES) {
      const candidate = base === "" ? index : `${base}/${index}`;
      if (has(candidate)) return candidate;
    }
    return null;
  }

  resolve(from: string, specifier: string): Resolution {
    if (specifier.startsWith("/")) {
      return {
        to: null,
        via: "relative",
        wildcard: false,
        problem: "is an absolute path, which no repository-relative tree can resolve",
      };
    }
    if (specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../")) {
      const joined = joinPath(dirname(from), specifier);
      if (joined === null)
        return { to: null, via: "relative", wildcard: false, problem: "climbs above the repository root" };
      const to = this.probe(joined);
      if (to === null) return { to: null, via: "relative", wildcard: false, problem: "names no file in the tree" };
      return { to, via: "relative", wildcard: false };
    }

    const config = this.tsconfigs.forFile(from);
    let aliasMiss: string | null = null;
    if (config !== null) {
      const match = matchAlias(config.aliases, specifier);
      if (match !== null) {
        for (const candidate of match.candidates) {
          const to = this.probe(candidate);
          if (to !== null) return { to, via: "alias", wildcard: match.wildcard };
        }
        // A catch-all `*` key falls back to packages, as TypeScript does; a named alias that misses is a broken import.
        if (!match.key.startsWith("*")) {
          aliasMiss = `matches the alias ${match.key} in ${config.path}, but none of its targets is a file in the tree`;
        }
      }
      if (config.baseUrl !== null) {
        const joined = joinPath(config.baseUrl, specifier);
        const to = joined === null ? null : this.probe(joined);
        if (to !== null) return { to, via: "baseUrl", wildcard: false };
      }
    }

    const workspace = this.resolveWorkspace(specifier);
    if (workspace !== null) return workspace;

    if (aliasMiss !== null) return { to: null, via: "alias", wildcard: false, problem: aliasMiss };
    if (PACKAGE_NAME.test(specifier)) return { to: null, via: "package", wildcard: false };
    return {
      to: null,
      via: "package",
      wildcard: false,
      problem: "is not relative, matches no tsconfig alias or workspace package, and is not a package name",
    };
  }

  private resolveWorkspace(specifier: string): Resolution | null {
    const pkg = this.packages.find((p) => specifier === p.name || specifier.startsWith(`${p.name}/`));
    if (pkg === undefined) return null;
    const subpath = specifier === pkg.name ? "." : `.${specifier.slice(pkg.name.length)}`;
    const exportsField = pkg.manifest.exports;
    const candidates: string[] = [];
    let wildcard = false;
    if (exportsField !== undefined && exportsField !== null) {
      const found = this.fromExports(exportsField, subpath);
      if (found === null) {
        return {
          to: null,
          via: "workspace",
          wildcard: false,
          problem: `names ${subpath} of workspace package ${pkg.name}, which its exports do not include`,
        };
      }
      candidates.push(...found.targets);
      wildcard = found.wildcard;
    } else if (subpath !== ".") {
      candidates.push(subpath);
      wildcard = true;
    }
    if (subpath === ".") {
      for (const field of ["types", "typings", "main", "module"]) {
        const value = pkg.manifest[field];
        if (typeof value === "string") candidates.push(value);
      }
      if (exportsField === undefined || exportsField === null) candidates.push("./index");
    }
    for (const candidate of candidates) {
      const joined = joinPath(pkg.dir, candidate);
      const to = joined === null ? null : this.probe(joined);
      if (to !== null) return { to, via: "workspace", wildcard };
    }
    return {
      to: null,
      via: "workspace",
      wildcard,
      problem: `names workspace package ${pkg.name}, whose entry is no file in the tree (name an export condition that points at source in \`conditions\`)`,
    };
  }

  private fromExports(field: unknown, subpath: string): { targets: string[]; wildcard: boolean } | null {
    if (typeof field === "string" || Array.isArray(field)) {
      return subpath === "." ? { targets: this.conditionTargets(field), wildcard: false } : null;
    }
    if (typeof field !== "object" || field === null) return null;
    const map = field as Record<string, unknown>;
    const keys = Object.keys(map);
    if (keys.every((key) => !key.startsWith("."))) {
      return subpath === "." ? { targets: this.conditionTargets(map), wildcard: false } : null;
    }
    if (map[subpath] !== undefined) return { targets: this.conditionTargets(map[subpath]), wildcard: false };
    let best: { key: string; capture: string } | null = null;
    for (const key of keys) {
      const star = key.indexOf("*");
      if (star === -1) continue;
      const prefix = key.slice(0, star);
      const suffix = key.slice(star + 1);
      if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix) || subpath.length < prefix.length + suffix.length)
        continue;
      if (best === null || prefix.length > best.key.indexOf("*")) {
        best = { key, capture: subpath.slice(prefix.length, subpath.length - suffix.length) };
      }
    }
    if (best === null) return null;
    const capture = best.capture;
    return {
      targets: this.conditionTargets(map[best.key]).map((target) => target.replaceAll("*", capture)),
      wildcard: true,
    };
  }

  /** Targets of an exports value in the order tried: configured conditions, then types, import, default. */
  private conditionTargets(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap((item) => this.conditionTargets(item));
    if (typeof value !== "object" || value === null) return [];
    const map = value as Record<string, unknown>;
    return this.conditions
      .filter((condition) => map[condition] !== undefined)
      .flatMap((condition) => this.conditionTargets(map[condition]));
  }

  /**
   * A configured specifier — a tsconfig alias or a workspace package name —
   * that resolves from `from` to `target`, shortest first; null when none
   * does. TS002 asks for this before calling a relative path a bypass.
   */
  aliasFor(from: string, target: string): string | null {
    const found: string[] = [];
    const config = this.tsconfigs.forFile(from);
    const variants = [target.replace(/\.(?:d\.)?[cm]?[jt]sx?$/, ""), target];
    if (/^index\.(?:d\.)?[cm]?[jt]sx?$/.test(basename(target))) variants.unshift(dirname(target));
    for (const alias of config?.aliases ?? []) {
      const star = alias.key.indexOf("*");
      if (star === -1) {
        if (this.resolve(from, alias.key).to === target) found.push(alias.key);
        continue;
      }
      for (const pattern of alias.targets) {
        const at = pattern.indexOf("*");
        if (at === -1) continue;
        const prefix = pattern.slice(0, at);
        const suffix = pattern.slice(at + 1);
        for (const variant of variants) {
          if (
            variant.length < prefix.length + suffix.length ||
            !variant.startsWith(prefix) ||
            !variant.endsWith(suffix)
          )
            continue;
          const capture = variant.slice(prefix.length, variant.length - suffix.length);
          const specifier = alias.key.slice(0, star) + capture + alias.key.slice(star + 1);
          if (this.resolve(from, specifier).to === target) found.push(specifier);
        }
      }
    }
    for (const pkg of this.packages) {
      if (this.resolve(from, pkg.name).to === target) found.push(pkg.name);
    }
    found.sort((a, b) => a.length - b.length || compareStrings(a, b));
    return found[0] ?? null;
  }
}
