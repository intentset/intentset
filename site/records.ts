/**
 * The worked example as the site reads it: every record under
 * examples/scheduling/, its frontmatter decoded and its body kept as source.
 *
 * The frontmatter is read here rather than by Markset's parser. Markset's YAML
 * subset reads `markset:` and `theme:` and leaves everything else to the
 * document's owner, and it rejects a block sequence written at the same
 * indentation as its key (`audiences:` / `- engineering`), which is the form
 * every record uses. The reader below covers what the records write: nested
 * maps, block sequences at either indentation, sequences of maps, flow
 * sequences, quoted and plain scalars. It is for the site's metadata card and
 * nothing more; the normative reader is @intentset/core's.
 */
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };
export type YamlMap = { [key: string]: YamlValue };

interface Line {
  indent: number;
  text: string;
}

/** Read a YAML document made of block maps, sequences and scalars. Throws on anything it cannot read. */
export function readYaml(source: string): YamlMap {
  const lines: Line[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const text = raw.trimEnd();
    if (text.trim() === "" || text.trim().startsWith("#")) continue;
    lines.push({ indent: raw.length - raw.trimStart().length, text: text.trim() });
  }
  if (lines.length === 0) return {};
  const [value, next] = readBlock(lines, 0, lines[0].indent);
  if (next !== lines.length) throw new Error(`yaml: unexpected content at "${lines[next].text}"`);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("yaml: expected a map");
  return value;
}

function readBlock(lines: Line[], at: number, indent: number): [YamlValue, number] {
  return isItem(lines[at].text) ? readSequence(lines, at, indent) : readMap(lines, at, indent);
}

function isItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

function readMap(lines: Line[], at: number, indent: number): [YamlMap, number] {
  const map: YamlMap = {};
  let i = at;
  while (i < lines.length && lines[i].indent === indent && !isItem(lines[i].text)) {
    const m = /^([^:#][^:]*?):(?:\s+(.*))?$/.exec(lines[i].text);
    if (!m) throw new Error(`yaml: expected "key: value", got "${lines[i].text}"`);
    const key = m[1].trim();
    const rest = (m[2] ?? "").trim();
    i++;
    if (rest !== "") {
      map[key] = scalar(rest);
    } else if (i < lines.length && lines[i].indent > indent) {
      [map[key], i] = readBlock(lines, i, lines[i].indent);
    } else if (i < lines.length && lines[i].indent === indent && isItem(lines[i].text)) {
      [map[key], i] = readSequence(lines, i, indent);
    } else {
      map[key] = null;
    }
  }
  if (i < lines.length && lines[i].indent > indent) throw new Error(`yaml: bad indentation at "${lines[i].text}"`);
  return [map, i];
}

function readSequence(lines: Line[], at: number, indent: number): [YamlValue[], number] {
  const list: YamlValue[] = [];
  let i = at;
  while (i < lines.length && lines[i].indent === indent && isItem(lines[i].text)) {
    const item = lines[i].text.slice(1).trim();
    if (item === "") {
      i++;
      if (i < lines.length && lines[i].indent > indent) {
        let value: YamlValue;
        [value, i] = readBlock(lines, i, lines[i].indent);
        list.push(value);
      } else {
        list.push(null);
      }
    } else if (/^[^:#][^:]*?:(\s|$)/.test(item)) {
      // A map whose first key shares the dash's line: re-read it as a line of its own at the content's indentation.
      const inner = indent + (lines[i].text.length - item.length);
      lines[i] = { indent: inner, text: item };
      let value: YamlValue;
      [value, i] = readMap(lines, i, inner);
      list.push(value);
    } else {
      list.push(scalar(item));
      i++;
    }
  }
  return [list, i];
}

function scalar(text: string): YamlValue {
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) return JSON.parse(text) as string;
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) return text.slice(1, -1).replace(/''/g, "'");
  const plain = text.replace(/\s+#.*$/, "");
  if (plain === "[]") return [];
  if (plain.startsWith("[") && plain.endsWith("]")) {
    return plain
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map(scalar);
  }
  if (plain === "null" || plain === "~") return null;
  if (plain === "true") return true;
  if (plain === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain);
  return plain;
}

// ---------------------------------------------------------------------------

export interface ExampleRecord {
  id: string;
  type: string;
  title: string;
  status: string;
  owner: string;
  visibility: string;
  audiences: string[];
  parent: string | null;
  /** Authored forward edges, relationship name to target ids, in source order. */
  links: Array<[string, string[]]>;
  /** The file's name, e.g. BEH-ASMT-SCHEDULE.md. */
  file: string;
  /** The document after its frontmatter: what the page renders. */
  body: string;
}

/** The model's own order, so the example index reads from product down to knowledge. */
export const TYPE_ORDER = [
  "product",
  "intent",
  "outcome",
  "measure",
  "capability",
  "behavior",
  "rule",
  "scenario",
  "slice",
  "contract",
  "decision",
  "verification",
  "knowledge",
];

export function typeRank(type: string): number {
  const at = TYPE_ORDER.indexOf(type);
  return at === -1 ? TYPE_ORDER.length : at;
}

/** Split a document into its frontmatter text and the body that follows. */
export function splitFrontmatter(source: string): { yaml: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!m) return { yaml: "", body: source };
  return { yaml: m[1], body: source.slice(m[0].length) };
}

function str(value: YamlValue | undefined, field: string, file: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  throw new Error(`${file}: intentset.${field} is missing`);
}

function strings(value: YamlValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Read one record file. */
export function readRecord(file: string, source: string): ExampleRecord {
  const { yaml, body } = splitFrontmatter(source);
  const meta = readYaml(yaml).intentset;
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) throw new Error(`${file}: no intentset block`);
  const links: Array<[string, string[]]> = [];
  const rawLinks = meta.links;
  if (rawLinks && typeof rawLinks === "object" && !Array.isArray(rawLinks)) {
    for (const [name, targets] of Object.entries(rawLinks)) links.push([name, strings(targets)]);
  }
  return {
    id: str(meta.id, "id", file),
    type: str(meta.type, "type", file),
    title: str(meta.title, "title", file),
    status: str(meta.status, "status", file),
    owner: str(meta.owner, "owner", file),
    visibility: str(meta.visibility, "visibility", file),
    audiences: strings(meta.audiences),
    parent: typeof meta.parent === "string" ? meta.parent : null,
    links,
    file,
    body,
  };
}

/** Every record in a directory, sorted by type in the model's order and then by id. */
export async function loadRecords(dir: string): Promise<ExampleRecord[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const records: ExampleRecord[] = [];
  for (const file of files) records.push(readRecord(basename(file), await readFile(join(dir, file), "utf8")));
  return records.sort((a, b) => typeRank(a.type) - typeRank(b.type) || a.id.localeCompare(b.id));
}
