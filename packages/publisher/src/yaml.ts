/**
 * The YAML the generated frontmatter is written in: block mappings with
 * two-space indentation, sequences indented under their key, `[]` for an
 * empty list, and strings left plain only when they are an identifier-like
 * token no reader could take for anything else. It is written for two
 * readers: core's strict reader (ADR 0001) and Markset's frontmatter subset,
 * which does not accept a sequence at its key's own indentation. Key order is
 * the object's own, so the output is fixed by the code that builds it.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export class YamlEmitError extends Error {}

export function emitYaml(value: { [key: string]: YamlValue }): string {
  const lines: string[] = [];
  writeMapping(value, 0, lines);
  return `${lines.join("\n")}\n`;
}

function writeMapping(mapping: { [key: string]: YamlValue }, indent: number, lines: string[]): void {
  const pad = " ".repeat(indent);
  for (const [key, value] of Object.entries(mapping)) {
    const label = `${pad}${scalar(key)}:`;
    if (Array.isArray(value)) {
      if (value.length === 0) lines.push(`${label} []`);
      else {
        lines.push(label);
        writeSequence(value, indent + 2, lines);
      }
    } else if (isMapping(value)) {
      if (Object.keys(value).length === 0) throw new YamlEmitError(`cannot write the empty mapping at ${key}`);
      lines.push(label);
      writeMapping(value, indent + 2, lines);
    } else {
      lines.push(`${label} ${scalar(value)}`);
    }
  }
}

function writeSequence(items: YamlValue[], indent: number, lines: string[]): void {
  const pad = " ".repeat(indent);
  for (const item of items) {
    if (isMapping(item)) {
      const inner: string[] = [];
      writeMapping(item, indent + 2, inner);
      if (inner.length === 0) throw new YamlEmitError("cannot write an empty mapping in a sequence");
      inner[0] = `${pad}- ${inner[0].slice(indent + 2)}`;
      lines.push(...inner);
    } else if (Array.isArray(item)) {
      throw new YamlEmitError("cannot write a sequence directly inside a sequence");
    } else {
      lines.push(`${pad}- ${scalar(item)}`);
    }
  }
}

const PLAIN = /^[A-Za-z_][A-Za-z0-9_./-]*$/;
const RESERVED = /^(?:true|false|yes|no|on|off|y|n|null)$/i;

function scalar(value: YamlValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isInteger(value))
      throw new YamlEmitError(`cannot write the number ${value}: only integers are written`);
    return String(value);
  }
  if (typeof value !== "string") throw new YamlEmitError("cannot write a collection as a scalar");
  if (hasControlCharacter(value)) throw new YamlEmitError("cannot write a string containing a control character");
  if (PLAIN.test(value) && !RESERVED.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isMapping(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
