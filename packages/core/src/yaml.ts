/**
 * The strict frontmatter reader (Core §3, ADR 0001).
 *
 * It reads the subset the carrier uses: block mappings, block and flow
 * sequences, plain and quoted scalars, integers, finite floats, booleans,
 * null, and comments. Everything outside that subset is an error with a line
 * number: duplicate keys, anchors, aliases, tags, merge keys, flow mappings
 * (the empty `{}` excepted, so an empty `layers` can be written), block
 * scalars, multi-document markers, directives, tabs as indentation, nesting
 * deeper than 16, more than 4096 lines, more than 256 KiB. Values are
 * JSON-compatible and quote-aware: `'0.1'` is a string, `0.1` is a number.
 */

export interface YamlError {
  message: string;
  /** 1-based line within the text handed to the reader. */
  line: number;
}

export type YamlResult = { value: Record<string, unknown>; error: null } | { value: null; error: YamlError };

/** `parseYaml` plus the line each key and sequence item starts on, keyed by JSON pointer. */
export type YamlDetail =
  | { value: Record<string, unknown>; lines: Map<string, number>; error: null }
  | { value: null; lines: Map<string, number>; error: YamlError };

export const YAML_MAX_BYTES = 256 * 1024;
export const YAML_MAX_LINES = 4096;
export const YAML_MAX_DEPTH = 16;

interface Line {
  indent: number;
  text: string;
  line: number;
}

class YamlFailure extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

/** Core §3 and ADR 0001: the strict reader. Returns the mapping or the first error with its line. */
export function parseYaml(text: string): YamlResult {
  const detail = parseYamlDetailed(text);
  if (detail.error) return { value: null, error: detail.error };
  return { value: detail.value, error: null };
}

/**
 * Core §3 and ADR 0001, with positions: the same reader, also returning the
 * 1-based line of every key and sequence item by JSON pointer, which is what
 * lets a diagnostic about `/intentset/links/governedBy/1` point at its line.
 */
export function parseYamlDetailed(text: string): YamlDetail {
  const lines = new Map<string, number>();
  try {
    const value = new Parser(text, lines).document();
    return { value, lines, error: null };
  } catch (error) {
    if (error instanceof YamlFailure)
      return { value: null, lines, error: { message: error.message, line: error.line } };
    throw error;
  }
}

/** ADR 0004: RFC 6901 escaping of one reference token, for diagnostic field pointers. */
export function pointerToken(key: string | number): string {
  return String(key).replace(/~/g, "~0").replace(/\//g, "~1");
}

const INT = /^[-+]?(?:0|[1-9][0-9]*)$/;
const FLOAT = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;
const NON_FINITE = /^[-+]?\.(?:inf|Inf|INF|nan|NaN|NAN)$/;
const ESCAPES: Record<string, string> = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\u0085",
  _: " ",
  L: " ",
  P: " ",
};

class Parser {
  private lines: Line[] = [];
  private positions: Map<string, number>;

  constructor(text: string, positions: Map<string, number>) {
    this.positions = positions;
    if (Buffer.byteLength(text, "utf8") > YAML_MAX_BYTES) {
      throw new YamlFailure(`The frontmatter is larger than ${YAML_MAX_BYTES / 1024} KiB.`, 1);
    }
    const raw = text.split(/\r?\n/);
    if (raw.length > YAML_MAX_LINES) {
      throw new YamlFailure(`The frontmatter has more than ${YAML_MAX_LINES} lines.`, YAML_MAX_LINES + 1);
    }
    for (let i = 0; i < raw.length; i++) {
      const line = i + 1;
      const whole = raw[i];
      if (/^\s*$/.test(whole)) continue;
      const leading = /^[ \t]*/.exec(whole)?.[0] ?? "";
      if (leading.includes("\t")) throw new YamlFailure("A tab is used as indentation; indent with spaces.", line);
      const content = whole.slice(leading.length).replace(/\s+$/, "");
      if (content.startsWith("#")) continue;
      if (leading.length === 0) {
        if (content === "---" || content.startsWith("--- ") || content === "...") {
          throw new YamlFailure("A document marker appears inside the frontmatter; one document only.", line);
        }
        if (content.startsWith("%")) throw new YamlFailure("YAML directives are not accepted.", line);
      }
      this.lines.push({ indent: leading.length, text: content, line });
    }
  }

  document(): Record<string, unknown> {
    if (this.lines.length === 0) return {};
    const first = this.lines[0];
    if (isSequenceItem(first.text)) {
      throw new YamlFailure("The frontmatter must be a mapping, not a sequence.", first.line);
    }
    const { value, next } = this.block(0, first.indent, 1, "");
    if (next < this.lines.length) {
      throw new YamlFailure("Unexpected content after the frontmatter mapping.", this.lines[next].line);
    }
    if (!isMapping(value)) throw new YamlFailure("The frontmatter must be a mapping.", first.line);
    return value;
  }

  private block(i: number, indent: number, depth: number, pointer: string): { value: unknown; next: number } {
    if (depth > YAML_MAX_DEPTH) {
      throw new YamlFailure(`Nesting is deeper than ${YAML_MAX_DEPTH} levels.`, this.lines[i].line);
    }
    if (isSequenceItem(this.lines[i].text)) return this.sequence(i, indent, depth, pointer);
    return this.mapping(i, indent, depth, pointer);
  }

  private mapping(start: number, indent: number, depth: number, pointer: string): { value: unknown; next: number } {
    const result: Record<string, unknown> = {};
    let i = start;
    while (i < this.lines.length && this.lines[i].indent === indent) {
      const current = this.lines[i];
      if (isSequenceItem(current.text)) {
        throw new YamlFailure("A sequence item appears where a mapping key was expected.", current.line);
      }
      const split = this.splitKey(current);
      if (split === null) throw new YamlFailure("Expected `key: value`.", current.line);
      const { key, rest } = split;
      if (key === "<<") throw new YamlFailure("Merge keys (`<<`) are not accepted.", current.line);
      if (Object.hasOwn(result, key)) throw new YamlFailure(`Duplicate key \`${key}\`.`, current.line);
      const childPointer = `${pointer}/${pointerToken(key)}`;
      this.positions.set(childPointer, current.line);
      let value: unknown;
      if (rest !== "") {
        value = this.inline(rest, current.line, depth, childPointer);
        i++;
      } else {
        i++;
        const next = this.lines[i];
        if (next !== undefined && next.indent > indent) {
          ({ value, next: i } = this.block(i, next.indent, depth + 1, childPointer));
        } else if (next !== undefined && next.indent === indent && isSequenceItem(next.text)) {
          ({ value, next: i } = this.sequence(i, indent, depth + 1, childPointer));
        } else {
          value = null;
        }
      }
      result[key] = value;
    }
    this.checkDedent(i, indent);
    return { value: result, next: i };
  }

  private sequence(start: number, indent: number, depth: number, pointer: string): { value: unknown; next: number } {
    if (depth > YAML_MAX_DEPTH) {
      throw new YamlFailure(`Nesting is deeper than ${YAML_MAX_DEPTH} levels.`, this.lines[start].line);
    }
    const items: unknown[] = [];
    let i = start;
    while (i < this.lines.length && this.lines[i].indent === indent && isSequenceItem(this.lines[i].text)) {
      const current = this.lines[i];
      const itemPointer = `${pointer}/${items.length}`;
      this.positions.set(itemPointer, current.line);
      const match = /^-(?: +(.*))?$/.exec(current.text);
      const rest = match?.[1] ?? "";
      const restIndent = indent + (current.text.length - rest.length);
      let value: unknown;
      if (rest === "" || rest.startsWith("#")) {
        i++;
        const next = this.lines[i];
        if (next !== undefined && next.indent > indent) {
          ({ value, next: i } = this.block(i, next.indent, depth + 1, itemPointer));
        } else {
          value = null;
        }
      } else if (isSequenceItem(rest) || this.splitKey({ ...current, text: rest }) !== null) {
        this.lines[i] = { indent: restIndent, text: rest, line: current.line };
        ({ value, next: i } = this.block(i, restIndent, depth + 1, itemPointer));
      } else {
        value = this.inline(rest, current.line, depth, itemPointer);
        i++;
      }
      items.push(value);
    }
    this.checkDedent(i, indent);
    return { value: items, next: i };
  }

  private checkDedent(i: number, indent: number): void {
    const line = this.lines[i];
    if (line !== undefined && line.indent > indent) {
      throw new YamlFailure("Unexpected indentation; multi-line plain scalars are not accepted.", line.line);
    }
  }

  /** `key: rest` or `key:`; null when the line is not a mapping entry. */
  private splitKey(line: Line): { key: string; rest: string } | null {
    const text = line.text;
    if (text.startsWith("? ")) throw new YamlFailure("Complex keys (`? `) are not accepted.", line.line);
    if (text.startsWith('"') || text.startsWith("'")) {
      const quoted = this.quoted(text, 0, line.line);
      const after = text.slice(quoted.end);
      const m = /^\s*:(?:\s+(.*))?$/.exec(after);
      if (m === null) return null;
      return { key: quoted.value, rest: stripComment(m[1]) };
    }
    const m = /^(.*?):(?:\s+(.*))?$/.exec(text);
    if (m === null) return null;
    const key = m[1].trim();
    if (key === "") throw new YamlFailure("Empty mapping key.", line.line);
    if (/^[[{]/.test(key)) {
      throw new YamlFailure("A flow collection cannot be a mapping key.", line.line);
    }
    if (/^[&*!]/.test(key)) this.rejectIndicator(key, line.line);
    if (/ #/.test(key)) return null;
    return { key, rest: stripComment(m[2]) };
  }

  private rejectIndicator(text: string, line: number): never {
    const c = text[0];
    if (c === "&") throw new YamlFailure("Anchors (`&`) are not accepted.", line);
    if (c === "*") throw new YamlFailure("Aliases (`*`) are not accepted.", line);
    if (c === "!") throw new YamlFailure("Tags (`!`) are not accepted.", line);
    if (c === "|" || c === ">") throw new YamlFailure("Block scalars (`|`, `>`) are not accepted.", line);
    if (c === "{") throw new YamlFailure("Flow mappings (`{ }`) are not accepted; write a block mapping.", line);
    if (c === "@" || c === "`") throw new YamlFailure(`The character \`${c}\` cannot start a scalar.`, line);
    if (c === "%") throw new YamlFailure("YAML directives are not accepted.", line);
    throw new YamlFailure(`Unexpected \`${c}\`.`, line);
  }

  /** A value on one line: quoted or plain scalar, flow sequence, or a rejected form. */
  private inline(raw: string, line: number, depth: number, pointer: string): unknown {
    const text = raw.trim();
    const c = text[0];
    if (c === "{" && text.replace(/\s*#.*$/, "") === "{}") return {};
    if ("&*!|>{@`%".includes(c)) this.rejectIndicator(text, line);
    if (c === "[") {
      const { value, end } = this.flowSequence(text, 0, line, depth + 1, pointer);
      this.expectTail(text, end, line);
      return value;
    }
    if (c === '"' || c === "'") {
      const { value, end } = this.quoted(text, 0, line);
      this.expectTail(text, end, line);
      return value;
    }
    return this.plain(text, line);
  }

  private expectTail(text: string, from: number, line: number): void {
    const tail = text.slice(from);
    if (!/^\s*(?:#.*)?$/.test(tail)) {
      throw new YamlFailure("Unexpected content after a scalar; a value is one scalar or one flow sequence.", line);
    }
  }

  private plain(raw: string, line: number): unknown {
    const commentAt = raw.search(/\s#/);
    const text = (commentAt === -1 ? raw : raw.slice(0, commentAt)).trim();
    if (/:\s|:$/.test(text)) {
      throw new YamlFailure("A plain scalar cannot contain `: `; quote the value.", line);
    }
    if (text === "" || text === "~" || text === "null" || text === "Null" || text === "NULL") return null;
    if (text === "true" || text === "True" || text === "TRUE") return true;
    if (text === "false" || text === "False" || text === "FALSE") return false;
    if (NON_FINITE.test(text)) throw new YamlFailure("Non-finite numbers are not accepted.", line);
    if (INT.test(text) || FLOAT.test(text)) return Number(text);
    return text;
  }

  private quoted(text: string, start: number, line: number): { value: string; end: number } {
    const quote = text[start];
    let out = "";
    let i = start + 1;
    while (i < text.length) {
      const c = text[i];
      if (quote === "'") {
        if (c === "'") {
          if (text[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          return { value: out, end: i + 1 };
        }
        out += c;
        i++;
        continue;
      }
      if (c === '"') return { value: out, end: i + 1 };
      if (c === "\\") {
        const e = text[i + 1];
        if (e === undefined) break;
        if (e in ESCAPES) {
          out += ESCAPES[e];
          i += 2;
          continue;
        }
        const width = e === "x" ? 2 : e === "u" ? 4 : e === "U" ? 8 : 0;
        if (width === 0) throw new YamlFailure(`Unknown escape \`\\${e}\`.`, line);
        const hex = text.slice(i + 2, i + 2 + width);
        if (!new RegExp(`^[0-9a-fA-F]{${width}}$`).test(hex)) {
          throw new YamlFailure(`Malformed escape \`\\${e}${hex}\`.`, line);
        }
        out += String.fromCodePoint(Number.parseInt(hex, 16));
        i += 2 + width;
        continue;
      }
      out += c;
      i++;
    }
    throw new YamlFailure("Unterminated quoted scalar.", line);
  }

  private flowSequence(
    text: string,
    start: number,
    line: number,
    depth: number,
    pointer: string,
  ): { value: unknown[]; end: number } {
    if (depth > YAML_MAX_DEPTH) throw new YamlFailure(`Nesting is deeper than ${YAML_MAX_DEPTH} levels.`, line);
    const items: unknown[] = [];
    let i = start + 1;
    let expectItem = true;
    for (;;) {
      while (text[i] === " ") i++;
      const c = text[i];
      if (c === undefined) throw new YamlFailure("Unterminated flow sequence; close it on the same line.", line);
      if (c === "]") return { value: items, end: i + 1 };
      if (!expectItem) throw new YamlFailure("Expected `,` or `]` in a flow sequence.", line);
      const itemPointer = `${pointer}/${items.length}`;
      this.positions.set(itemPointer, line);
      let value: unknown;
      if (c === "[") {
        ({ value, end: i } = this.flowSequence(text, i, line, depth + 1, itemPointer));
      } else if (c === '"' || c === "'") {
        ({ value, end: i } = this.quoted(text, i, line));
      } else if (c === ",") {
        throw new YamlFailure("Empty item in a flow sequence.", line);
      } else {
        if ("&*!|>{@`%".includes(c)) this.rejectIndicator(text.slice(i), line);
        let j = i;
        while (j < text.length && text[j] !== "," && text[j] !== "]") j++;
        const scalar = text.slice(i, j).trim();
        if (scalar.includes("#")) throw new YamlFailure("A comment cannot appear inside a flow sequence.", line);
        value = this.plain(scalar, line);
        i = j;
      }
      items.push(value);
      while (text[i] === " ") i++;
      if (text[i] === ",") {
        i++;
        expectItem = true;
      } else {
        expectItem = false;
      }
    }
  }
}

/** The rest of a `key:` line with a trailing comment-only remainder read as empty. */
function stripComment(rest: string | undefined): string {
  const text = (rest ?? "").trim();
  return text.startsWith("#") ? "" : text;
}

function isSequenceItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
