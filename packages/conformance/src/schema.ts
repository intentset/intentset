/**
 * A small JSON Schema evaluator for the subset of draft 2020-12 that
 * spec/conformance.schema.json, spec/frontmatter.schema.json and
 * spec/export.schema.json use. Dependency-free on purpose: the harness is the
 * thing other code is measured against, so it must not lean on a library whose
 * reading of the schema nobody here has checked.
 *
 * Supported: type, enum, const, pattern, minLength, maxLength, minimum,
 * maximum, required, properties, additionalProperties (boolean or schema),
 * propertyNames, items, minItems, maxItems, uniqueItems, allOf, anyOf, oneOf,
 * not, if/then/else, and local $ref into $defs. Annotation keywords
 * ($schema, $id, title, description, default, examples, deprecated, format)
 * are ignored. Any other keyword throws, so a schema the evaluator does not
 * fully understand can never read as satisfied.
 */

export type Schema = boolean | { [keyword: string]: unknown };

export interface SchemaError {
  /** JSON pointer (RFC 6901) to the offending value; "" is the root. */
  path: string;
  message: string;
}

const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$comment",
  "$defs",
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
  "format",
  "readOnly",
  "writeOnly",
]);

const KEYWORDS = new Set([
  "$ref",
  "type",
  "enum",
  "const",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "required",
  "properties",
  "additionalProperties",
  "propertyNames",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
]);

export function validateSchema(schema: Schema, value: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  check(schema, value, "", schema, errors);
  return errors;
}

function check(schema: Schema, value: unknown, path: string, root: Schema, errors: SchemaError[]): void {
  if (schema === true) return;
  if (schema === false) {
    errors.push({ path, message: "no value is allowed here" });
    return;
  }

  for (const keyword of Object.keys(schema)) {
    if (!KEYWORDS.has(keyword) && !ANNOTATIONS.has(keyword)) {
      throw new Error(`unsupported schema keyword "${keyword}" at ${path || "the root"}`);
    }
  }

  if (typeof schema.$ref === "string") {
    check(resolveRef(schema.$ref, root), value, path, root, errors);
  }

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!allowed.some((t) => matchesType(t, value))) {
      errors.push({ path, message: `expected ${allowed.join(" | ")}, got ${describe(value)}` });
      return;
    }
  }

  if (schema.const !== undefined && !sameJson(schema.const, value)) {
    errors.push({ path, message: `expected the constant ${JSON.stringify(schema.const)}, got ${show(value)}` });
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((e) => sameJson(e, value))) {
    errors.push({ path, message: `expected one of ${JSON.stringify(schema.enum)}, got ${show(value)}` });
  }

  if (typeof value === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push({ path, message: `${show(value)} does not match /${schema.pattern}/` });
    }
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength) {
      errors.push({ path, message: `expected at least ${schema.minLength} character(s), got ${length}` });
    }
    if (typeof schema.maxLength === "number" && length > schema.maxLength) {
      errors.push({ path, message: `expected at most ${schema.maxLength} character(s), got ${length}` });
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push({ path, message: `expected at least ${schema.minimum}, got ${value}` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push({ path, message: `expected at most ${schema.maximum}, got ${value}` });
    }
  }

  if (isObject(value)) {
    const props = isObject(schema.properties) ? (schema.properties as Record<string, Schema>) : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!Object.hasOwn(value, key)) errors.push({ path, message: `missing required property "${key}"` });
      }
    }
    for (const key of Object.keys(value).sort()) {
      const child = `${path}/${escapePointer(key)}`;
      if (schema.propertyNames !== undefined) {
        const scratch: SchemaError[] = [];
        check(schema.propertyNames as Schema, key, child, root, scratch);
        if (scratch.length > 0) errors.push({ path: child, message: `property name ${scratch[0].message}` });
      }
      if (Object.hasOwn(props, key)) {
        check(props[key], value[key], child, root, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: child, message: "unexpected property" });
      } else if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
        check(schema.additionalProperties as Schema, value[key], child, root, errors);
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push({ path, message: `expected at least ${schema.minItems} item(s), got ${value.length}` });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push({ path, message: `expected at most ${schema.maxItems} item(s), got ${value.length}` });
    }
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      value.forEach((item, i) => {
        const key = canonical(item);
        if (seen.has(key)) errors.push({ path: `${path}/${i}`, message: `duplicate item ${show(item)}` });
        seen.add(key);
      });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => {
        check(schema.items as Schema, item, `${path}/${i}`, root, errors);
      });
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf as Schema[]) check(sub, value, path, root, errors);
  }

  if (Array.isArray(schema.anyOf)) {
    const subs = schema.anyOf as Schema[];
    if (!subs.some((sub) => holds(sub, value, root))) {
      errors.push({ path, message: `matches none of the ${subs.length} alternatives` });
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const subs = schema.oneOf as Schema[];
    const matching = subs.filter((sub) => holds(sub, value, root)).length;
    if (matching !== 1) {
      errors.push({ path, message: `matches ${matching} of ${subs.length} alternatives, expected exactly one` });
    }
  }

  if (schema.not !== undefined && holds(schema.not as Schema, value, root)) {
    errors.push({ path, message: "matches a schema it must not match" });
  }

  if (schema.if !== undefined) {
    if (holds(schema.if as Schema, value, root)) {
      if (schema.then !== undefined) check(schema.then as Schema, value, path, root, errors);
    } else if (schema.else !== undefined) {
      check(schema.else as Schema, value, path, root, errors);
    }
  }
}

function holds(schema: Schema, value: unknown, root: Schema): boolean {
  const scratch: SchemaError[] = [];
  check(schema, value, "", root, scratch);
  return scratch.length === 0;
}

function resolveRef(ref: string, root: Schema): Schema {
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) throw new Error(`only local $ref is supported, got ${ref}`);
  let node: unknown = root;
  for (const rawSegment of ref.slice(2).split("/")) {
    const segment = unescapePointer(rawSegment);
    if (!isObject(node) || !Object.hasOwn(node, segment)) throw new Error(`unresolvable $ref ${ref}`);
    node = node[segment];
  }
  return node as Schema;
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    default:
      throw new Error(`unsupported type keyword "${type}"`);
  }
}

export function escapePointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function show(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function sameJson(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/** JSON with object keys sorted, so two equal values always spell the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
