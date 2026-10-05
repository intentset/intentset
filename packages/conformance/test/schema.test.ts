import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { type Schema, validateSchema } from "../src/schema.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");

function errors(schema: Schema, value: unknown): string[] {
  return validateSchema(schema, value).map((e) => `${e.path || "/"}: ${e.message}`);
}

test("type, enum, const and pattern report with JSON pointer paths", () => {
  const schema: Schema = {
    type: "object",
    properties: {
      kind: { enum: ["a", "b"] },
      spec: { const: "0.1" },
      id: { type: "string", pattern: "^[A-Z]+-[0-9]+$" },
      count: { type: ["integer", "null"] },
      "a/b": { type: "boolean" },
    },
  };
  assert.deepEqual(errors(schema, { kind: "a", spec: "0.1", id: "AB-1", count: null, "a/b": true }), []);
  assert.deepEqual(errors(schema, { kind: "c", spec: 0.1, id: "ab-1", count: 1.5, "a/b": "x" }), [
    "/a~1b: expected boolean, got string",
    "/count: expected integer | null, got number",
    '/id: "ab-1" does not match /^[A-Z]+-[0-9]+$/',
    '/kind: expected one of ["a","b"], got "c"',
    '/spec: expected the constant "0.1", got 0.1',
  ]);
  assert.deepEqual(errors(schema, []), ["/: expected object, got array"]);
});

test("required, additionalProperties and propertyNames", () => {
  const closed: Schema = {
    type: "object",
    required: ["name"],
    properties: { name: { type: "string" } },
    additionalProperties: false,
  };
  assert.deepEqual(errors(closed, { name: "x" }), []);
  assert.deepEqual(errors(closed, { nmae: "x" }), [
    '/: missing required property "name"',
    "/nmae: unexpected property",
  ]);

  const typed: Schema = { type: "object", additionalProperties: { type: ["string", "null"] } };
  assert.deepEqual(errors(typed, { a: "x", b: null }), []);
  assert.deepEqual(errors(typed, { a: 1 }), ["/a: expected string | null, got number"]);

  const open: Schema = { type: "object", additionalProperties: true };
  assert.deepEqual(errors(open, { anything: [1] }), []);

  const named: Schema = { type: "object", propertyNames: { pattern: "^[^/]+/.+$" } };
  assert.deepEqual(errors(named, { "acme/thing": 1 }), []);
  assert.deepEqual(errors(named, { thing: 1 }), ['/thing: property name "thing" does not match /^[^/]+/.+$/']);
});

test("items, minItems, maxItems, uniqueItems, minLength and minimum", () => {
  const schema: Schema = {
    type: "array",
    items: { type: "string", minLength: 1 },
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
  };
  assert.deepEqual(errors(schema, ["a", "b"]), []);
  assert.deepEqual(errors(schema, []), ["/: expected at least 1 item(s), got 0"]);
  assert.deepEqual(errors(schema, ["a", "a", ""]), [
    '/1: duplicate item "a"',
    "/2: expected at least 1 character(s), got 0",
  ]);
  assert.deepEqual(errors(schema, ["a", "b", "c", "d"]), ["/: expected at most 3 item(s), got 4"]);
  assert.deepEqual(
    errors({ type: "array", uniqueItems: true }, [
      { a: 1, b: 2 },
      { b: 2, a: 1 },
    ]),
    ['/1: duplicate item {"b":2,"a":1}'],
  );
  assert.deepEqual(errors({ type: "integer", minimum: 1 }, 0), ["/: expected at least 1, got 0"]);
  assert.deepEqual(errors({ type: "integer", minimum: 1 }, 1), []);
});

test("if/then, allOf, anyOf, oneOf, not and local $ref", () => {
  const conditional: Schema = {
    type: "object",
    allOf: [
      // biome-ignore lint/suspicious/noThenProperty: JSON Schema's own keyword
      { if: { properties: { type: { const: "slice" } } }, then: { required: ["slice"] } },
      {
        if: { properties: { type: { const: "behavior" } } },
        // biome-ignore lint/suspicious/noThenProperty: JSON Schema's own keyword
        then: { properties: { profile: { const: "intentset/behavior/0.1" } } },
        else: { properties: { profile: { pattern: "^intentset/" } } },
      },
    ],
  };
  assert.deepEqual(errors(conditional, { type: "slice", slice: {}, profile: "intentset/slice/0.1" }), []);
  assert.deepEqual(errors(conditional, { type: "slice", profile: "x" }), [
    '/: missing required property "slice"',
    '/profile: "x" does not match /^intentset//',
  ]);
  assert.deepEqual(errors(conditional, { type: "behavior", profile: "intentset/rule/0.1" }), [
    '/profile: expected the constant "intentset/behavior/0.1", got "intentset/rule/0.1"',
  ]);
  // An `if` over a property the value lacks holds vacuously in draft 2020-12, so
  // every `then` applies at once: the frontmatter schema lists `type` under
  // `required` for exactly this reason.
  assert.deepEqual(errors(conditional, {}), ['/: missing required property "slice"']);

  const alternatives: Schema = {
    $defs: { id: { type: "string", pattern: "^[A-Z]+$" } },
    anyOf: [{ $ref: "#/$defs/id" }, { type: "null" }],
    oneOf: [{ type: "string" }, { type: "null" }],
    not: { const: "FORBIDDEN" },
  };
  assert.deepEqual(errors(alternatives, "ABC"), []);
  assert.deepEqual(errors(alternatives, null), []);
  assert.deepEqual(errors(alternatives, "abc"), ["/: matches none of the 2 alternatives"]);
  assert.deepEqual(errors(alternatives, "FORBIDDEN"), ["/: matches a schema it must not match"]);
  assert.deepEqual(errors({ oneOf: [{ type: "string" }, { minLength: 1 }] }, "a"), [
    "/: matches 2 of 2 alternatives, expected exactly one",
  ]);
  assert.deepEqual(errors(false, 1), ["/: no value is allowed here"]);
  assert.deepEqual(errors(true, 1), []);
});

test("annotations are ignored and any other keyword is refused rather than skipped", () => {
  const annotated: Schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "t",
    description: "d",
    default: null,
    examples: [1],
    format: "date-time",
    type: "string",
  };
  assert.deepEqual(errors(annotated, "x"), []);
  assert.throws(
    () => validateSchema({ type: "string", maxProperties: 1 }, "x"),
    /unsupported schema keyword "maxProperties"/,
  );
  assert.throws(() => validateSchema({ $ref: "https://example.org/x" }, "x"), /only local \$ref/);
  assert.throws(() => validateSchema({ $ref: "#/$defs/missing" }, "x"), /unresolvable \$ref/);
});

test("the three normative schemas are within the subset, and the example documents satisfy the frontmatter one", async () => {
  const schemas = await Promise.all(
    ["conformance", "frontmatter", "export"].map(async (name) => {
      const path = join(root, "spec", `${name}.schema.json`);
      const text = await readFile(path, "utf8").catch(() => null);
      return [name, text === null ? null : (JSON.parse(text) as Schema)] as const;
    }),
  );
  for (const [name, schema] of schemas) {
    if (schema === null) continue; // not written yet; this test covers it when it is
    assert.doesNotThrow(() => validateSchema(schema, {}), `${name}.schema.json uses a keyword the evaluator lacks`);
    assert.doesNotThrow(() => validateSchema(schema, []), `${name}.schema.json uses a keyword the evaluator lacks`);
  }

  const conformance = schemas.find(([name]) => name === "conformance")?.[1] as Schema;
  assert.deepEqual(validateSchema(conformance, []), []);
  assert.deepEqual(
    validateSchema(conformance, [
      {
        section: "core",
        name: "C03 governedBy targets a capability",
        baseline: "scheduling",
        patch: { "BEH-ASMT-SCHEDULE.md": { frontmatter: { "intentset.links.governedBy": ["CAP-ASMT-ASSIGN"] } } },
        valid: false,
        diagnostics: ["CORE003"],
      },
    ]),
    [],
  );
  assert.deepEqual(
    errors(conformance, [{ section: "core", name: "x", valid: true, diagnostics: ["core3"], extra: 1 }]),
    [
      '/0/diagnostics/0: "core3" does not match /^(?:[A-Z]+[0-9]{3}|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$/',
      "/0/extra: unexpected property",
    ],
  );
  // A Markset code is a case's to expect too, under the markset carrier (Core §11).
  assert.deepEqual(
    errors(conformance, [
      { section: "core", name: "x", carrier: "markset", valid: true, diagnostics: ["COLUMNS_SINGLE", "CORE009"] },
    ]),
    [],
  );

  const frontmatter = schemas.find(([name]) => name === "frontmatter")?.[1] as Schema;
  const good = {
    markset: 0,
    intentset: {
      spec: "0.1",
      profile: "intentset/rule/0.1",
      id: "RULE-ASMT-AUTH",
      type: "rule",
      title: "Require assignment permission",
      status: "draft",
      owner: "team-assessment",
      visibility: "internal",
      audiences: ["engineering"],
      revision: 1,
    },
  };
  assert.deepEqual(validateSchema(frontmatter, good), []);
  const bad = structuredClone(good);
  bad.intentset.profile = "intentset/behavior/0.1";
  bad.intentset.type = "behavior";
  assert.deepEqual(errors(frontmatter, bad), [
    '/intentset: missing required property "availability"',
    '/intentset: missing required property "parent"',
  ]);
});
