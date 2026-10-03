/**
 * A small JSON Schema (draft 2020-12) evaluator for the subset the project's
 * schemas use (ADR 0002): type, enum, const, pattern, required, properties,
 * additionalProperties, items, uniqueItems, minItems, minLength, minimum,
 * propertyNames, if/then, allOf, anyOf, oneOf, not, and local $ref into $defs.
 * It is a test instrument: the typed checks in src/ are the implementation,
 * and this is how the test proves they agree with the normative schema.
 */
import { canonicalJson } from "../src/index.ts";

export type Schema = boolean | Record<string, unknown>;

export interface SchemaError {
  /** JSON pointer to the offending value. */
  instance: string;
  keyword: string;
  message: string;
}

export function validateSchema(schema: Schema, value: unknown): SchemaError[] {
  const errors: SchemaError[] = [];
  evaluate(schema, value, "", schema, errors);
  return errors;
}

function evaluate(schema: Schema, value: unknown, path: string, root: Schema, errors: SchemaError[]): void {
  if (schema === true) return;
  if (schema === false) {
    errors.push({ instance: path, keyword: "false", message: "schema false" });
    return;
  }
  const fail = (keyword: string, message: string) => errors.push({ instance: path, keyword, message });

  if (typeof schema.$ref === "string") {
    const target = resolveRef(schema.$ref, root);
    evaluate(target, value, path, root, errors);
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => matchesType(t, value))) fail("type", `expected ${types.join("|")}, got ${typeName(value)}`);
  }
  if (schema.enum !== undefined) {
    const options = schema.enum as unknown[];
    if (!options.some((o) => canonicalJson(o) === canonicalJson(value)))
      fail("enum", `not one of ${JSON.stringify(options)}`);
  }
  if (Object.hasOwn(schema, "const")) {
    if (canonicalJson(schema.const) !== canonicalJson(value)) fail("const", `expected ${JSON.stringify(schema.const)}`);
  }
  if (typeof value === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value))
      fail("pattern", `does not match ${schema.pattern}`);
    if (typeof schema.minLength === "number" && [...value].length < schema.minLength)
      fail("minLength", `shorter than ${schema.minLength}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) fail("minimum", `below ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems)
      fail("minItems", `fewer than ${schema.minItems} items`);
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (const item of value) {
        const key = canonicalJson(item);
        if (seen.has(key)) {
          fail("uniqueItems", "items are not unique");
          break;
        }
        seen.add(key);
      }
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => {
        evaluate(schema.items as Schema, item, `${path}/${i}`, root, errors);
      });
    }
  }
  if (isObject(value)) {
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!Object.hasOwn(value, key)) fail("required", `missing ${key}`);
      }
    }
    for (const key of Object.keys(value)) {
      const child = `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (Object.hasOwn(properties, key)) {
        evaluate(properties[key], value[key], child, root, errors);
      } else if (schema.additionalProperties !== undefined) {
        if (schema.additionalProperties === false)
          errors.push({ instance: child, keyword: "additionalProperties", message: `unknown property ${key}` });
        else evaluate(schema.additionalProperties as Schema, value[key], child, root, errors);
      }
      if (schema.propertyNames !== undefined) {
        const nameErrors: SchemaError[] = [];
        evaluate(schema.propertyNames as Schema, key, child, root, nameErrors);
        if (nameErrors.length > 0)
          errors.push({ instance: child, keyword: "propertyNames", message: `property name ${key} is invalid` });
      }
    }
  }
  if (schema.allOf !== undefined) {
    for (const sub of schema.allOf as Schema[]) evaluate(sub, value, path, root, errors);
  }
  if (schema.anyOf !== undefined) {
    const passes = (schema.anyOf as Schema[]).some((sub) => validateAgainst(sub, value, path, root));
    if (!passes) fail("anyOf", "matches none of the alternatives");
  }
  if (schema.oneOf !== undefined) {
    const count = (schema.oneOf as Schema[]).filter((sub) => validateAgainst(sub, value, path, root)).length;
    if (count !== 1) fail("oneOf", `matches ${count} alternatives`);
  }
  if (schema.not !== undefined) {
    if (validateAgainst(schema.not as Schema, value, path, root)) fail("not", "matches the forbidden schema");
  }
  if (schema.if !== undefined) {
    if (validateAgainst(schema.if as Schema, value, path, root)) {
      if (schema.then !== undefined) evaluate(schema.then as Schema, value, path, root, errors);
    } else if (schema.else !== undefined) {
      evaluate(schema.else as Schema, value, path, root, errors);
    }
  }
}

function validateAgainst(schema: Schema, value: unknown, path: string, root: Schema): boolean {
  const errors: SchemaError[] = [];
  evaluate(schema, value, path, root, errors);
  return errors.length === 0;
}

function resolveRef(ref: string, root: Schema): Schema {
  if (!ref.startsWith("#/")) throw new Error(`only local $ref is supported, got ${ref}`);
  let node: unknown = root;
  for (const token of ref.slice(2).split("/")) {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObject(node) || !Object.hasOwn(node, key)) throw new Error(`$ref ${ref} does not resolve`);
    node = node[key];
  }
  return node as Schema;
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return isObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      throw new Error(`unsupported type ${type}`);
  }
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
