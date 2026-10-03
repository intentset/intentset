/**
 * Expansion of a conformance case into a repository tree (ADR 0006).
 *
 * A case names a baseline directory under examples/, then edits it: whole
 * files (null deletes), dotted-path frontmatter patches and body replacements,
 * a registries mapping and a config mapping. This module turns that into the
 * files a driver reads and the files the published suite ships. It is pure:
 * it reads the baseline from disk and nothing else, and the YAML reader is
 * passed in, so the expansion can be tested on synthetic input and so the
 * published suite is staged by the same code the harness runs.
 *
 * Expansion is idempotent. A staged case carries its registries and config
 * inside `files`, as `registries.yaml` and `.intentset/config.yaml`, and
 * expanding it again yields the same tree.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { Level } from "@intentset/core";
import type { ConformanceCase, ExpandedCase, Patch } from "./types.ts";

export const REGISTRIES_PATH = "registries.yaml";
export const CONFIG_PATH = ".intentset/config.yaml";

export type ParseYaml = (
  text: string,
) =>
  | { value: Record<string, unknown>; error: null }
  | { value: null; error: { message: string; line: number } | { message: string } };

export interface ExpandOptions {
  /** The directory baselines live under: examples/ in this repository. */
  examplesDir: string;
  /** Core's strict reader, or any reader of the same shape. Needed only when a case patches frontmatter. */
  parseYaml: ParseYaml;
}

export function expandCase(testCase: ConformanceCase, options: ExpandOptions): ExpandedCase {
  const tree = new Map<string, string>();

  if (testCase.baseline !== undefined) {
    const dir = resolve(options.examplesDir, testCase.baseline);
    for (const [path, text] of readTree(dir)) tree.set(path, text);
  }

  for (const [path, text] of entries(testCase.files)) {
    if (text === null) tree.delete(path);
    else tree.set(path, text);
  }

  for (const [path, patch] of entries(testCase.patch)) {
    const source = tree.get(path);
    if (source === undefined) throw new Error(`patch names ${path}, which is not in the tree`);
    tree.set(path, applyPatch(source, patch, options.parseYaml, path));
  }

  if (testCase.registries !== undefined) tree.set(REGISTRIES_PATH, serializeYaml(testCase.registries));
  if (testCase.config !== undefined) tree.set(CONFIG_PATH, serializeYaml(testCase.config));

  const files = new Map<string, string>();
  for (const path of [...tree.keys()].sort()) {
    if (path === REGISTRIES_PATH || path === CONFIG_PATH) continue;
    files.set(path, tree.get(path) as string);
  }

  const sources = new Map<string, string>();
  for (const [path, text] of entries(testCase.sources)) {
    if (text !== null) sources.set(path, text);
  }

  return {
    files,
    registriesText: tree.get(REGISTRIES_PATH) ?? null,
    configText: tree.get(CONFIG_PATH) ?? null,
    sources: new Map([...sources].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    level: (testCase.level ?? "L1") as Level,
    evidence: testCase.evidence ?? [],
    request: testCase.request ?? null,
  };
}

/** The whole tree as one map, registries and config included: the form the published suite ships. */
export function treeOf(expanded: ExpandedCase): Map<string, string> {
  const tree = new Map(expanded.files);
  if (expanded.registriesText !== null) tree.set(REGISTRIES_PATH, expanded.registriesText);
  if (expanded.configText !== null) tree.set(CONFIG_PATH, expanded.configText);
  return new Map([...tree].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function entries<T>(record: Record<string, T> | undefined): [string, T][] {
  return Object.entries(record ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Every file under a directory, by POSIX path relative to it, sorted. */
export function readTree(dir: string): Map<string, string> {
  const tree = new Map<string, string>();
  const paths = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  for (const path of paths) {
    tree.set(relative(dir, path).split(sep).join("/"), readFileSync(path, "utf8"));
  }
  return new Map([...tree].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// --- patches -----------------------------------------------------------------

export interface SplitDocument {
  /** The YAML between the fences, without them; null when the document has no frontmatter. */
  frontmatter: string | null;
  /** Everything after the closing fence's line break, or the whole file when there is no frontmatter. */
  body: string;
}

/** Split a document at its frontmatter fences. A `---` first line with a `---` closing line, nothing more. */
export function splitDocument(source: string): SplitDocument {
  const lines = source.split("\n");
  if (lines[0] !== "---") return { frontmatter: null, body: source };
  const close = lines.indexOf("---", 1);
  if (close === -1) return { frontmatter: null, body: source };
  return {
    frontmatter: lines.slice(1, close).join("\n"),
    body: lines.slice(close + 1).join("\n"),
  };
}

export function applyPatch(source: string, patch: Patch, parseYaml: ParseYaml, path = "document"): string {
  const { frontmatter, body } = splitDocument(source);
  let yaml = frontmatter;

  if (patch.frontmatter !== undefined) {
    const parsed = frontmatter === null ? { value: {}, error: null } : parseYaml(frontmatter);
    if (parsed.error !== null || parsed.value === null) {
      throw new Error(`cannot patch ${path}: its frontmatter does not parse (${parsed.error?.message})`);
    }
    const value = parsed.value;
    for (const [dotted, replacement] of entries(patch.frontmatter)) {
      setDotted(value, dotted.split("."), replacement);
    }
    yaml = serializeYaml(value);
    if (yaml.endsWith("\n")) yaml = yaml.slice(0, -1);
  }

  const newBody = patch.body ?? body;
  if (yaml === null) return newBody;
  return `---\n${yaml}\n---\n${newBody}`;
}

/**
 * Set or delete (null) a value at a dotted path, creating intermediate
 * mappings. A numeric segment indexes an existing sequence; anything else is
 * a mapping key. A dot always splits: no key in the carrier contains one.
 */
export function setDotted(root: Record<string, unknown>, segments: string[], value: unknown): void {
  let node: Record<string, unknown> | unknown[] = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next: unknown = Array.isArray(node) ? node[index(segment, node)] : node[segment];
    if (isObject(next) || Array.isArray(next)) {
      node = next;
    } else {
      const created: Record<string, unknown> = {};
      if (Array.isArray(node)) node[index(segment, node)] = created;
      else node[segment] = created;
      node = created;
    }
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(node)) {
    const i = index(last, node);
    if (value === null) node.splice(i, 1);
    else node[i] = value;
  } else if (value === null) {
    delete node[last];
  } else {
    node[last] = value;
  }
}

function index(segment: string, list: unknown[]): number {
  const i = Number(segment);
  if (!Number.isInteger(i) || i < 0 || i > list.length) {
    throw new Error(`"${segment}" is not an index into a sequence of ${list.length}`);
  }
  return i;
}

// --- YAML serialization -------------------------------------------------------

/**
 * Block YAML in the style of the examples: mappings one key per line,
 * sequences as `- item` lines at the parent key's indentation, empty
 * collections as `[]` and `{}`, numbers and booleans bare, and strings
 * single-quoted whenever a plain scalar would read as anything but that
 * string. Key order is the mapping's own: it is data, and it is what makes
 * the example's frontmatter come back byte for byte.
 */
export function serializeYaml(value: Record<string, unknown>): string {
  const lines: string[] = [];
  writeMapping(value, 0, lines);
  return lines.length === 0 ? "{}\n" : `${lines.join("\n")}\n`;
}

function writeMapping(mapping: Record<string, unknown>, indent: number, lines: string[]): void {
  const pad = " ".repeat(indent);
  for (const [key, value] of Object.entries(mapping)) {
    const label = `${pad}${scalar(key)}:`;
    if (isObject(value)) {
      if (Object.keys(value).length === 0) lines.push(`${label} {}`);
      else {
        lines.push(label);
        writeMapping(value, indent + 2, lines);
      }
    } else if (Array.isArray(value)) {
      if (value.length === 0) lines.push(`${label} []`);
      else {
        lines.push(label);
        writeSequence(value, indent, lines);
      }
    } else {
      lines.push(`${label} ${scalar(value)}`);
    }
  }
}

function writeSequence(items: unknown[], indent: number, lines: string[]): void {
  const pad = " ".repeat(indent);
  for (const item of items) {
    if (isObject(item)) {
      if (Object.keys(item).length === 0) {
        lines.push(`${pad}- {}`);
        continue;
      }
      const inner: string[] = [];
      writeMapping(item, indent + 2, inner);
      inner[0] = `${pad}- ${inner[0].slice(indent + 2)}`;
      lines.push(...inner);
    } else if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push(`${pad}- []`);
        continue;
      }
      const inner: string[] = [];
      writeSequence(item, indent + 2, inner);
      inner[0] = `${pad}- ${inner[0].slice(indent + 2)}`;
      lines.push(...inner);
    } else {
      lines.push(`${pad}- ${scalar(item)}`);
    }
  }
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot serialize ${value}: the carrier has no such number`);
    return String(value);
  }
  if (typeof value !== "string") throw new Error(`cannot serialize a ${typeof value} as YAML`);
  if (hasControlCharacters(value)) return JSON.stringify(value);
  return needsQuotes(value) ? `'${value.replace(/'/g, "''")}'` : value;
}

/** Anything below a space except tab, or DEL: a single-quoted scalar cannot carry it, a double-quoted one can. */
function hasControlCharacters(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true;
  }
  return false;
}

/** Everything a plain scalar could be mistaken for, read conservatively: quoting is never wrong. */
const NON_STRING = /^(?:true|false|yes|no|on|off|y|n|null|~|[-+]?\.(?:inf|nan))$/i;

function needsQuotes(text: string): boolean {
  if (text === "") return true;
  if (/^\s|\s$/.test(text)) return true;
  if (NON_STRING.test(text)) return true;
  if (/^[-+.]?\d/.test(text)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(text)) return true;
  if (text.includes(": ") || text.includes(" #") || text.endsWith(":")) return true;
  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
