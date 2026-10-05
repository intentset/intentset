import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { EXPORT_PROBLEM_CATEGORIES, type ExportEnvelope, readExport } from "../src/index.ts";
import { REPO_ROOT, SPEC_DIR, readJson } from "./cases.ts";
import { type Schema, validateSchema } from "./schema.ts";

const schema = readJson(join(SPEC_DIR, "export.schema.json")) as Schema;
const fixture = (name: string) => readFileSync(join(REPO_ROOT, "tests", "consumer", name), "utf8");
const full = JSON.parse(fixture("full.json")) as Record<string, unknown>;

/** Every [pointer, parent, key] in a JSON value, depth first. */
function* nodes(
  value: unknown,
  pointer = "",
): Generator<[string, Record<string, unknown> | unknown[], string | number]> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      yield [`${pointer}/${i}`, value, i];
      yield* nodes(value[i], `${pointer}/${i}`);
    }
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      yield [`${pointer}/${key}`, value as Record<string, unknown>, key];
      yield* nodes((value as Record<string, unknown>)[key], `${pointer}/${key}`);
    }
  }
}

function at(root: unknown, pointer: string): [Record<string, unknown> | unknown[], string | number] {
  const parts = pointer.split("/").slice(1);
  let parent = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) parent = parent[part] as Record<string, unknown>;
  const last = parts[parts.length - 1];
  return [parent, Array.isArray(parent) ? Number(last) : last];
}

/** A value of another JSON type than `value`, so the mutant breaks the shape wherever the schema types it. */
function otherType(value: unknown): unknown {
  if (typeof value === "string") return 7;
  if (typeof value === "number") return "7";
  if (typeof value === "boolean") return "true";
  if (value === null) return 7;
  if (Array.isArray(value)) return { item: value };
  return [value];
}

test("the reader's shape checks agree with spec/export.schema.json on every single-node mutant of full.json", () => {
  const pointers = [...nodes(full)].map(([pointer]) => pointer);
  let disagreements: string[] = [];
  // Every node deleted, retyped and, for an object, given an unknown member: a few thousand mutants.
  let compared = 0;
  for (const pointer of pointers) {
    for (const operation of ["delete", "retype", "extend"] as const) {
      const mutant = structuredClone(full);
      const [parent, key] = at(mutant, pointer);
      if (operation === "delete") {
        if (Array.isArray(parent)) parent.splice(key as number, 1);
        else delete parent[key as string];
      } else if (operation === "retype") {
        (parent as Record<string, unknown>)[key as string] = otherType(
          (parent as Record<string, unknown>)[key as string],
        );
      } else {
        const target = (parent as Record<string, unknown>)[key as string];
        if (target === null || typeof target !== "object" || Array.isArray(target)) continue;
        (target as Record<string, unknown>).zz = "x";
      }
      if (pointer === "/contract") continue; // a contract that is not 0.2's is unsupported-contract, by design before shape
      const schemaSays = validateSchema(schema, mutant).length > 0;
      const read = readExport(mutant);
      const readerSays = !read.ok && read.category === "malformed";
      compared++;
      // An array losing an item can stay well-formed and become inconsistent instead: that is not malformed,
      // so it counts as agreement here, and the consistency checks are the fixtures' to cover.
      if (schemaSays !== readerSays) {
        disagreements.push(
          `${operation} ${pointer}: schema ${schemaSays ? "rejects" : "accepts"}, reader ${read.ok ? "accepts" : read.category}`,
        );
      }
    }
  }
  disagreements = disagreements.slice(0, 20);
  assert.deepEqual(disagreements, []);
  assert.ok(compared > 2000, `only ${compared} mutants compared`);
});

test("a diagnostic's code shape follows its origin: Markset's codes under syntax, Intentset's under every other", () => {
  const origins = ["syntax", "profile", "graph", "architecture", "evidence", "publication", "render"];
  const codes = [
    "DIRECTIVE_UNKNOWN_NAME",
    "COLUMNS_SINGLE",
    "CORE003",
    "TS004",
    "CORE_003",
    "directive_unknown",
    "DIRECTIVE",
  ];
  const markset = new Set(["DIRECTIVE_UNKNOWN_NAME", "COLUMNS_SINGLE", "CORE_003"]);
  const intentset = new Set(["CORE003", "TS004"]);
  for (const origin of origins) {
    for (const code of codes) {
      const value = structuredClone(full) as unknown as ExportEnvelope;
      value.validation.warnings = 1;
      value.validation.diagnostics = [
        {
          code,
          severity: "warning",
          origin: origin as ExportEnvelope["validation"]["diagnostics"][number]["origin"],
          artifact: null,
          path: "CAP-ASMT-ASSIGN.md",
          location: { line: 9, column: 1 },
          message: "A message.",
          remediation: "A remediation.",
        },
      ];
      const expected = origin === "syntax" ? markset.has(code) : intentset.has(code);
      const schemaSays = validateSchema(schema, value).length === 0;
      const read = readExport(value);
      assert.equal(schemaSays, expected, `schema, ${origin} ${code}`);
      assert.equal(read.ok, expected, `reader, ${origin} ${code}`);
      if (!read.ok) {
        assert.equal(read.category, "malformed");
        assert.equal(read.problems[0].pointer, "/validation/diagnostics/0/code");
      }
    }
  }
});

test("bytes, text and parsed values read alike; invalid UTF-8, oversize and truncation are not-json", () => {
  const text = fixture("full.json");
  const fromText = readExport(text);
  const fromBytes = readExport(new TextEncoder().encode(text));
  const fromValue = readExport(JSON.parse(text));
  assert.ok(fromText.ok && fromBytes.ok && fromValue.ok);
  assert.deepEqual(fromText, fromBytes);
  assert.deepEqual(fromText, fromValue);
  const bad = readExport(new Uint8Array([0x7b, 0xff, 0x7d]));
  assert.equal(!bad.ok && bad.category, "not-json");
  const big = readExport(text, { maxBytes: 100 });
  assert.equal(!big.ok && big.category, "not-json");
  assert.match(!big.ok ? big.problems[0].message : "", /over the 100-byte limit/);
  assert.equal(readExport(text.slice(0, 500)).ok, false);
});

test("a missing or unknown contract is unsupported-contract before any shape check", () => {
  for (const contract of [
    undefined,
    3,
    "intentset/export/0.1",
    "intentset/export/0.2",
    "intentset/export/0.4",
    "other/export/0.3",
  ]) {
    const value = { ...full, contract };
    const read = readExport(value);
    assert.equal(!read.ok && read.category, "unsupported-contract", String(contract));
  }
  const read = readExport([]);
  assert.equal(!read.ok && read.category, "unsupported-contract");
});

test("problems come back ordered by category, the first naming the result", () => {
  const value = structuredClone(full) as unknown as ExportEnvelope;
  value.validation.status = value.validation.status === "pass" ? "fail" : "pass";
  value.repository = "example/elsewhere";
  const read = readExport(value, { repository: "example/scheduling" });
  assert.equal(read.ok, false);
  if (read.ok) return;
  assert.equal(read.category, "identity-mismatch");
  const ranks = read.problems.map((p) => EXPORT_PROBLEM_CATEGORIES.indexOf(p.category));
  assert.deepEqual(
    ranks,
    [...ranks].sort((a, b) => a - b),
  );
  assert.ok(read.problems.some((p) => p.category === "inconsistent-report"));
  for (const problem of read.problems) assert.match(problem.message, /\.$/);
});

test("an artifact list out of order or repeated is malformed: a consumer keys on artifact ID", () => {
  const swapped = structuredClone(full) as unknown as ExportEnvelope;
  [swapped.artifacts[0], swapped.artifacts[1]] = [swapped.artifacts[1], swapped.artifacts[0]];
  assert.equal(readExport(swapped).ok, false);
  const repeated = structuredClone(full) as unknown as ExportEnvelope;
  repeated.artifacts[1] = repeated.artifacts[0];
  const read = readExport(repeated);
  assert.equal(!read.ok && read.category, "malformed");
});
