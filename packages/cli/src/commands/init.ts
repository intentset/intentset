/**
 * `intentset init`: the one command that writes, and it only creates. It
 * writes `.intentset/config.yaml`, an empty-but-valid
 * `.intentset/registries.yaml` and `.intentset/agents.md`, the guide coding
 * agents follow to keep the model current, and with `--example` the
 * scheduling example's records under `product/scheduling/` and its
 * registries in place of the empty ones. `--agents` writes the guide alone,
 * for a repository initialized before there was one, with the scope its
 * config already names. Every target is checked before anything is written,
 * and each file is opened with exclusive create, so an existing file is never
 * overwritten, not even by a race.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareStrings, DEFAULT_IGNORE, readConfig, readRegistries } from "@intentset/core";
import { AGENT_GUIDE_PATH, AGENT_POINTERS, agentGuide } from "../agents.ts";
import type { Io } from "../output.ts";
import { CONFIG_PATH } from "../repository.ts";

export const REGISTRIES_PATH = ".intentset/registries.yaml";
export const DEFAULT_INIT_SCOPE = "product/**/*.md";
const EXAMPLE_TARGET = "product/scheduling";

export interface InitOptions {
  root?: string;
  repository?: string;
  example: boolean;
  /** Write only the agent guide. */
  agentsOnly?: boolean;
}

/** YAML double-quoted scalar; the strict reader takes JSON's escapes. */
function quote(value: string): string {
  return JSON.stringify(value);
}

export function configText(repository: string): string {
  return [
    "# Intentset configuration (Core §11): the repository scope a conformance claim is about.",
    "# Written by `intentset init`. Patterns are repository-relative: literal segments, * within",
    "# one segment, ** across segments.",
    `repository: ${quote(repository)}`,
    "scope:",
    `  - ${quote(DEFAULT_INIT_SCOPE)}`,
    `registries: ${quote(REGISTRIES_PATH)}`,
    "ignore:",
    ...DEFAULT_IGNORE.map((pattern) => `  - ${quote(pattern)}`),
    "",
  ].join("\n");
}

export const EMPTY_REGISTRIES_TEXT = [
  "# Intentset registries (Core §4, §7; VSA §3): the owners, audiences, release dimensions",
  "# and shared resources records may name. An empty registry reads as not declared, and",
  "# validate warns (CORE005) when a record names a value it could not check.",
  "owners: []",
  "audiences: []",
  "releases: []",
  "roles: []",
  "editions: []",
  "flags: []",
  "resources: []",
  "",
].join("\n");

/**
 * The scheduling example: this repository's own copy when running from a
 * checkout, otherwise the one @intentset/conformance-suite ships. Null when
 * neither is present.
 */
export async function exampleDir(): Promise<string | null> {
  const candidates = [fileURLToPath(new URL("../../../../examples/scheduling/", import.meta.url))];
  try {
    const suite = (await import("@intentset/conformance-suite")) as { examplesPath?: string };
    if (typeof suite.examplesPath === "string") candidates.push(join(suite.examplesPath, "scheduling"));
  } catch {
    // Not installed: the checkout's copy is the only candidate.
  }
  return candidates.find((dir) => existsSync(join(dir, "registries.yaml"))) ?? null;
}

export async function initCommand(options: InitOptions, io: Io): Promise<number> {
  const root = resolve(io.cwd, options.root ?? ".");
  const repository = options.repository ?? basename(root);
  if (repository.trim() === "" || /[\r\n]/.test(repository)) {
    io.stderr("intentset init: --repository must be a non-empty name on one line, such as org/name.\n");
    return 2;
  }

  if (options.agentsOnly === true) return writeGuideOnly(root, io);

  // Everything to write, decided before anything is written.
  const files = new Map<string, string>([[CONFIG_PATH, configText(repository)]]);
  let registries = EMPTY_REGISTRIES_TEXT;
  if (options.example) {
    const dir = await exampleDir();
    if (dir === null) {
      io.stderr(
        "intentset init: --example needs the scheduling example, which is in an Intentset checkout under\n" +
          "examples/scheduling and in the @intentset/conformance-suite package. Neither was found; install\n" +
          "@intentset/conformance-suite beside @intentset/cli, or run init without --example.\n",
      );
      return 2;
    }
    registries = readFileSync(join(dir, "registries.yaml"), "utf8");
    for (const name of readdirSync(dir)
      .filter((n) => n.endsWith(".md"))
      .sort(compareStrings)) {
      files.set(`${EXAMPLE_TARGET}/${name}`, readFileSync(join(dir, name), "utf8"));
    }
  }
  files.set(REGISTRIES_PATH, registries);
  files.set(AGENT_GUIDE_PATH, agentGuide([DEFAULT_INIT_SCOPE]));

  // What init writes must read back clean, or it has handed the user a broken repository.
  const config = readConfig(files.get(CONFIG_PATH) as string, CONFIG_PATH);
  const registry = readRegistries(registries, REGISTRIES_PATH);
  if (config.diagnostics.length > 0 || registry.diagnostics.length > 0) {
    io.stderr("intentset init: the files it would write do not read back clean; nothing was written.\n");
    return 2;
  }

  if (!create(root, files, io)) return 2;
  const scope = options.example ? `${files.size - 3} example records in scope` : "an empty scope";
  io.stdout(`Initialized ${quote(repository)} with ${scope}. Next: intentset validate\n`);
  pointers(io);
  return 0;
}

/** `init --agents`: the guide alone, for the scope the repository's config names, or the default with no config. */
function writeGuideOnly(root: string, io: Io): number {
  let scope = [DEFAULT_INIT_SCOPE];
  const configFile = join(root, CONFIG_PATH);
  if (existsSync(configFile)) {
    const { config, diagnostics } = readConfig(readFileSync(configFile, "utf8"), CONFIG_PATH);
    if (diagnostics.length === 0 && config.scope.length > 0) scope = config.scope;
  }
  if (!create(root, new Map([[AGENT_GUIDE_PATH, agentGuide(scope)]]), io)) return 2;
  pointers(io);
  return 0;
}

/** Create every file or none: refuse if any exists, then write each with exclusive create. */
function create(root: string, files: Map<string, string>, io: Io): boolean {
  const ordered = [...files.keys()].sort(compareStrings);
  const existing = ordered.filter((path) => existsSync(join(root, path)));
  if (existing.length > 0) {
    io.stderr(
      `intentset init: refusing to overwrite ${existing.join(", ")}; init only creates files.\n` +
        "Remove them first if a fresh start is what you want.\n",
    );
    return false;
  }
  for (const path of ordered) {
    const target = join(root, path);
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, files.get(path) as string, { flag: "wx" });
    } catch (error) {
      io.stderr(`intentset init: could not create ${path}: ${(error as Error).message}\n`);
      return false;
    }
    io.stdout(`created ${path}\n`);
  }
  return true;
}

/** How to point a repository's agents at the guide. init never edits a file it did not create, so it says rather than does. */
function pointers(io: Io): void {
  io.stdout(`\nPoint your coding agents at ${AGENT_GUIDE_PATH} with one line in the file they read:\n`);
  for (const [file, line] of AGENT_POINTERS) io.stdout(`  ${file}: ${line}\n`);
}
