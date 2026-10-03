/**
 * The repository as the architecture and evidence checks see it: every file
 * `listFiles` returns that neither `.intentset/config.yaml` nor
 * `.intentset/architecture.yaml` ignores. Code and configuration carry their
 * text; every other file (a stylesheet, an image, a font) is present with an
 * empty text, so an import of it resolves to a file rather than to nothing.
 * A text file over 1 MiB is present but not read, and the report lists it,
 * rather than a check quietly seeing less than the tree holds.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ARCHITECTURE_CONFIG_PATH, readArchitectureConfig, resolveConfig } from "@intentset/architecture";
import type { Config } from "@intentset/core";
import { listFiles } from "./repository.ts";

/** Extensions read as text: code the import graph needs, and the JSON, Markdown and YAML it and the claims name. */
export const TEXT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yaml",
  ".yml",
];

/** The largest file read into the tree; Core §3 bounds what a tool reads, and a record has the same limit. */
export const TREE_MAX_BYTES = 1024 * 1024;

export interface Tree {
  /** Every path in the tree, with its text for code and configuration and "" for anything else. */
  files: Map<string, string>;
  /** Every path in the tree, for checks that only ask whether a file exists. */
  paths: Set<string>;
  /** Files with a text extension that were over the limit and not read, sorted. */
  skipped: string[];
}

export function readTree(root: string, config: Pick<Config, "ignore">): Tree {
  let ignore = resolveConfig().ignore;
  try {
    const text = readFileSync(join(root, ARCHITECTURE_CONFIG_PATH), "utf8");
    ignore = resolveConfig(readArchitectureConfig(text).config).ignore;
  } catch {
    // No architecture configuration: its default ignore list stands.
  }
  const files = new Map<string, string>();
  const skipped: string[] = [];
  const paths = listFiles(root, [...config.ignore, ...ignore]);
  for (const path of paths) {
    const file = join(root, path);
    if (!TEXT_EXTENSIONS.some((extension) => path.endsWith(extension))) files.set(path, "");
    else if (statSync(file).size > TREE_MAX_BYTES) {
      skipped.push(path);
      files.set(path, "");
    } else files.set(path, readFileSync(file, "utf8"));
  }
  return { files, paths: new Set(paths), skipped };
}
