/**
 * What the evidence package's subject hash needs from the architecture
 * (Core §8, ADR 0013): the files each slice's claims resolve to, the files of
 * each registry resource, the local files a test imports (resolved with the
 * same TypeScript-aware resolver as the import graph, and stopping at a
 * package boundary), the global inputs expanded to paths, and which files can
 * move any subject at all. Pure: it reads the tree it is given and the file
 * contents through the function it is given.
 */
import type { Graph, Registries } from "@intentset/core";
import { ARCHITECTURE_CONFIG_PATH, type ArchitectureConfig, readArchitectureConfig, resolveConfig } from "./config.ts";
import { extractImports } from "./extract.ts";
import { isCode } from "./paths.ts";
import { compareStrings, matchPattern } from "./patterns.ts";
import { buildModel } from "./regions.ts";
import { Resolver } from "./resolve.ts";

export interface SubjectSourceOptions {
  /** Laid over the defaults and `.intentset/architecture.yaml`, as for `checkArchitecture`. */
  config?: Partial<ArchitectureConfig>;
  /** `evidence.globalInputs`: paths, or patterns expanded over the tree. */
  globalInputs: readonly string[];
  /** The bytes of a repository-relative file, or undefined when it does not exist. */
  readFile: (path: string) => Uint8Array | undefined;
}

/** Shaped as the evidence package's `SubjectSource`, which this package does not import. */
export interface ArchitectureSubjectSource {
  readFile: (path: string) => Uint8Array | undefined;
  sliceFiles: Map<string, string[]>;
  resources: Map<string, { record: unknown; files: string[] }>;
  localImports: (path: string) => string[];
  globalInputs: string[];
  covers: (path: string) => boolean;
}

/** A global input with no `*` is a path, present or not (a missing one moves the subject when it appears); the rest are patterns. */
function expandGlobalInputs(inputs: readonly string[], paths: Iterable<string>): string[] {
  const all = [...paths];
  const out = new Set<string>();
  for (const input of inputs) {
    if (!input.includes("*")) out.add(input);
    else for (const path of all) if (matchPattern(input, path)) out.add(path);
  }
  return [...out].sort(compareStrings);
}

export function subjectSource(
  graph: Graph,
  registries: Registries,
  tree: { files: ReadonlyMap<string, string> },
  options: SubjectSourceOptions,
): ArchitectureSubjectSource {
  const configText = tree.files.get(ARCHITECTURE_CONFIG_PATH);
  const fileConfig =
    configText === undefined ? undefined : readArchitectureConfig(configText, ARCHITECTURE_CONFIG_PATH).config;
  const config = resolveConfig(fileConfig, options.config);
  const model = buildModel(graph, registries, tree.files, config);

  const sliceFiles = new Map<string, string[]>();
  for (const slice of model.slices) {
    sliceFiles.set(slice.id, [...new Set(slice.claimFiles.flat())].sort(compareStrings));
  }
  const resources = new Map<string, { record: unknown; files: string[] }>();
  for (const info of model.resources)
    resources.set(info.resource.id, { record: info.resource, files: [...info.files] });

  let resolver: Resolver | null = null;
  const closures = new Map<string, string[]>();
  const importsOf = (path: string): string[] => {
    resolver ??= new Resolver(model.files, config);
    const text = model.files.get(path);
    if (text === undefined || !isCode(path)) return [];
    const targets: string[] = [];
    for (const raw of extractImports(path, text).imports) {
      const resolution = resolver.resolve(path, raw.specifier);
      if (resolution.problem === undefined && resolution.to !== null) targets.push(resolution.to);
    }
    return targets;
  };
  const localImports = (start: string): string[] => {
    const cached = closures.get(start);
    if (cached !== undefined) return cached;
    const boundary = model.packageOf(start);
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      for (const target of importsOf(file)) {
        if (seen.has(target) || model.packageOf(target) !== boundary) continue;
        seen.add(target);
        queue.push(target);
      }
    }
    seen.delete(start);
    const list = [...seen].sort(compareStrings);
    closures.set(start, list);
    return list;
  };

  const globalInputs = expandGlobalInputs(options.globalInputs, tree.files.keys());

  let covered: Set<string> | null = null;
  const covers = (path: string): boolean => {
    if (covered === null) {
      covered = new Set<string>(globalInputs);
      for (const files of sliceFiles.values()) for (const file of files) covered.add(file);
      const used = new Set<string>();
      for (const slice of model.slices) for (const id of slice.meta.usesResources) used.add(id);
      for (const artifact of graph.artifacts.values()) {
        covered.add(artifact.path);
        const verification = artifact.meta.verification;
        if (artifact.meta.type !== "verification" || verification === undefined) continue;
        covered.add(verification.locator);
        for (const file of localImports(verification.locator)) covered.add(file);
        for (const id of verification.exercises ?? []) used.add(id);
      }
      for (const id of used) for (const file of resources.get(id)?.files ?? []) covered.add(file);
    }
    return covered.has(path);
  };

  return { readFile: options.readFile, sliceFiles, resources, localImports, globalInputs, covers };
}
