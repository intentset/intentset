/**
 * `paths` and `baseUrl` from the tsconfig.json nearest to an importing file,
 * walking up from it, with `extends` followed while the extended file is in
 * the tree (profile TS002, TS004, TS006). A root tsconfig is not assumed: a
 * monorepo's apps/web/tsconfig.json governs apps/web alone.
 *
 * TypeScript 7 offers no in-process config parser, so tsconfig's JSON with
 * comments and trailing commas is read here. Resolution follows TypeScript:
 * `paths` targets are relative to `baseUrl` when one is in effect, otherwise
 * to the directory of the config that declares `paths`; a child's `paths` or
 * `baseUrl` replaces its parent's whole.
 */
import { ancestors, dirname, joinPath } from "./paths.ts";

export interface PathAlias {
  /** The key as written: `@assessment/*` or `@app/router`. */
  key: string;
  /** Repository-relative targets, each with at most one `*`. */
  targets: string[];
}

export interface TsConfig {
  /** Repository path of the config file this was read from. */
  path: string;
  /** Effective baseUrl as a repository directory, or null. */
  baseUrl: string | null;
  /** Effective aliases, targets already joined to their base. */
  aliases: PathAlias[];
}

export interface TsConfigNote {
  path: string;
  message: string;
}

/** Strip comments and trailing commas from JSON with comments, leaving strings alone. */
export function stripJsonComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

interface RawConfig {
  extends?: unknown;
  compilerOptions?: { baseUrl?: unknown; paths?: unknown };
}

export class TsConfigs {
  private readonly files: ReadonlyMap<string, string>;
  private readonly loaded = new Map<string, TsConfig | null>();
  private readonly nearest = new Map<string, TsConfig | null>();
  readonly notes: TsConfigNote[] = [];

  constructor(files: ReadonlyMap<string, string>) {
    this.files = files;
  }

  /** The effective config for a file: the nearest tsconfig.json at or above its directory, or null. */
  forFile(path: string): TsConfig | null {
    const directory = dirname(path);
    const cached = this.nearest.get(directory);
    if (cached !== undefined) return cached;
    let found: TsConfig | null = null;
    for (const dir of ancestors(directory)) {
      const candidate = dir === "" ? "tsconfig.json" : `${dir}/tsconfig.json`;
      if (this.files.has(candidate)) {
        found = this.load(candidate, []);
        break;
      }
    }
    this.nearest.set(directory, found);
    return found;
  }

  private load(path: string, chain: string[]): TsConfig | null {
    const cached = this.loaded.get(path);
    if (cached !== undefined) return cached;
    if (chain.includes(path)) {
      this.notes.push({
        path,
        message: `extends itself through ${[...chain, path].join(" -> ")}; the cycle is cut here`,
      });
      return null;
    }
    const text = this.files.get(path);
    if (text === undefined) return null;
    let raw: RawConfig;
    try {
      raw = JSON.parse(stripJsonComments(text)) as RawConfig;
    } catch (error) {
      this.notes.push({ path, message: `does not parse (${(error as Error).message}), so its paths are not applied` });
      this.loaded.set(path, null);
      return null;
    }
    const directory = dirname(path);
    let baseUrl: string | null = null;
    let aliases: PathAlias[] = [];
    const parents = typeof raw.extends === "string" ? [raw.extends] : Array.isArray(raw.extends) ? raw.extends : [];
    for (const parent of parents) {
      if (typeof parent !== "string") continue;
      const target = this.extendsTarget(directory, parent);
      if (target === null) {
        this.notes.push({
          path,
          message: `extends ${parent}, which is not in the tree; any paths it declares are not applied`,
        });
        continue;
      }
      const inherited = this.load(target, [...chain, path]);
      if (inherited === null) continue;
      if (inherited.baseUrl !== null) baseUrl = inherited.baseUrl;
      if (inherited.aliases.length > 0) aliases = inherited.aliases;
    }
    const options = raw.compilerOptions ?? {};
    if (typeof options.baseUrl === "string") baseUrl = joinPath(directory, options.baseUrl);
    if (options.paths !== undefined && typeof options.paths === "object" && options.paths !== null) {
      const base = baseUrl ?? directory;
      aliases = [];
      for (const [key, targets] of Object.entries(options.paths as Record<string, unknown>)) {
        if (!Array.isArray(targets)) continue;
        const joined = targets
          .filter((target): target is string => typeof target === "string")
          .map((target) => joinPath(base, target))
          .filter((target): target is string => target !== null);
        aliases.push({ key, targets: joined });
      }
    }
    // Inherited targets were joined to the base of the config that declared them, as TypeScript resolves them.
    const config: TsConfig = { path, baseUrl, aliases };
    this.loaded.set(path, config);
    return config;
  }

  private extendsTarget(directory: string, specifier: string): string | null {
    if (!specifier.startsWith(".")) {
      const candidate = `node_modules/${specifier}`;
      return this.files.has(candidate) ? candidate : null;
    }
    const joined = joinPath(directory, specifier);
    if (joined === null) return null;
    if (this.files.has(joined)) return joined;
    if (this.files.has(`${joined}.json`)) return `${joined}.json`;
    return null;
  }
}

/**
 * TypeScript's `paths` matching: an exact key wins; otherwise the wildcard
 * key with the longest prefix. Returns the candidate target paths in order,
 * and whether the key that matched had a wildcard.
 */
export function matchAlias(
  aliases: readonly PathAlias[],
  specifier: string,
): { key: string; candidates: string[]; wildcard: boolean } | null {
  const exact = aliases.find((alias) => !alias.key.includes("*") && alias.key === specifier);
  if (exact !== undefined) return { key: exact.key, candidates: [...exact.targets], wildcard: false };
  let best: { alias: PathAlias; capture: string; prefix: number } | null = null;
  for (const alias of aliases) {
    const star = alias.key.indexOf("*");
    if (star === -1) continue;
    const prefix = alias.key.slice(0, star);
    const suffix = alias.key.slice(star + 1);
    if (specifier.length < prefix.length + suffix.length) continue;
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    if (best === null || prefix.length > best.prefix) {
      best = {
        alias,
        capture: specifier.slice(prefix.length, specifier.length - suffix.length),
        prefix: prefix.length,
      };
    }
  }
  if (best === null) return null;
  const capture = best.capture;
  return {
    key: best.alias.key,
    candidates: best.alias.targets.map((target) => target.replace("*", capture)),
    wildcard: true,
  };
}
