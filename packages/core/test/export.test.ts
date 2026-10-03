import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  type ExportEnvelope,
  canonicalJson,
  exportGraph,
  graphHash,
  plainCarrier,
  readRegistries,
  sha256Hex,
  validate,
} from "../src/index.ts";
import { EXAMPLES_DIR, SPEC_DIR, readJson } from "./cases.ts";
import { type Schema, validateSchema } from "./schema.ts";

const exportSchema = readJson(join(SPEC_DIR, "export.schema.json")) as Schema;
const dir = join(EXAMPLES_DIR, "scheduling");
const names = readdirSync(dir)
  .filter((name) => name.endsWith(".md"))
  .sort();
const registries = readRegistries(readFileSync(join(dir, "registries.yaml"), "utf8"), "registries.yaml").registries;

function inputs(order: string[] = names) {
  return order.map((name) => plainCarrier(name, readFileSync(join(dir, name), "utf8")));
}

const META = {
  repository: "example/scheduling",
  commit: null,
  commitUnavailable: "not a repository",
  generatedAt: "2026-10-02T12:00:00Z",
};

function plain(envelope: ExportEnvelope): unknown {
  return JSON.parse(JSON.stringify(envelope));
}

test("the export of examples/scheduling validates against spec/export.schema.json", () => {
  const envelope = exportGraph(validate(inputs(), registries), registries, META);
  assert.deepEqual(validateSchema(exportSchema, plain(envelope)), []);
  assert.equal(envelope.artifacts.length, 13);
  assert.equal(envelope.validation.status, "pass");
});

test("with bodies, with a commit and a release, it still validates", () => {
  const envelope = exportGraph(validate(inputs(), registries), registries, {
    repository: "example/scheduling",
    commit: "0123456789abcdef0123456789abcdef01234567",
    scope: ["examples/scheduling/**/*.md"],
    level: "L2",
    release: { product: "PRD-LANTERN", label: "pilot-1" },
    generatedAt: "2026-10-02T12:00:00.123+02:00",
    includeBodies: true,
  });
  assert.deepEqual(validateSchema(exportSchema, plain(envelope)), []);
  assert.equal(envelope.source.commitUnavailable, undefined);
  assert.ok(envelope.artifacts.every((a) => typeof a.body === "string" && a.body.includes(`# ${a.title}`)));
});

test("bodies are excluded unless asked for", () => {
  const envelope = exportGraph(validate(inputs(), registries), registries, META);
  assert.ok(envelope.artifacts.every((a) => !Object.hasOwn(a, "body")));
});

test("a null commit always carries a reason", () => {
  const envelope = exportGraph(validate(inputs(), registries), registries, { repository: "r", commit: null });
  assert.equal(typeof envelope.source.commitUnavailable, "string");
  assert.deepEqual(validateSchema(exportSchema, plain(envelope)), []);
});

test("the schema rejects what a consumer must reject", () => {
  const good = plain(exportGraph(validate(inputs(), registries), registries, META)) as Record<string, unknown>;
  const bad = (mutate: (e: Record<string, unknown>) => void) => {
    const copy = structuredClone(good);
    mutate(copy);
    return validateSchema(exportSchema, copy).length > 0;
  };
  assert.ok(
    bad((e) => (e.contract = "intentset/export/0.2")),
    "unsupported contract version",
  );
  assert.ok(
    bad((e) => (e.repository = "")),
    "empty repository identity",
  );
  assert.ok(
    bad((e) => (e.graphHash = "abc")),
    "malformed graph hash",
  );
  assert.ok(
    bad((e) => ((e.source as Record<string, unknown>).commitUnavailable = undefined)),
    "null commit without reason",
  );
  assert.ok(
    bad((e) => ((e.artifacts as Record<string, unknown>[])[0].id = "adr-1")),
    "invalid artifact ID",
  );
  assert.ok(
    bad((e) => ((e.artifacts as Record<string, unknown>[])[0].profile = "intentset/rule/0.1")),
    "profile mismatching type",
  );
  assert.ok(
    bad((e) => (e.unknown = 1)),
    "unknown top-level member",
  );
});

test("two exports with the same generatedAt are byte-identical, whatever the input order", () => {
  const a = JSON.stringify(exportGraph(validate(inputs(), registries), registries, META));
  const b = JSON.stringify(exportGraph(validate(inputs([...names].reverse()), registries), registries, META));
  assert.equal(a, b);
});

test("generatedAt defaults to now and is the only thing that differs", () => {
  const result = validate(inputs(), registries);
  const now = exportGraph(result, registries, { repository: "r", commit: null });
  assert.ok(Math.abs(Date.parse(now.generatedAt) - Date.now()) < 60_000);
  const fixed = exportGraph(result, registries, { repository: "r", commit: null, generatedAt: now.generatedAt });
  assert.equal(JSON.stringify(now), JSON.stringify(fixed));
});

test("the graph hash depends on bytes and edges, not on order or time", () => {
  const forward = validate(inputs(), registries).graph;
  const reverse = validate(inputs([...names].reverse()), registries).graph;
  assert.equal(graphHash(forward), graphHash(reverse));
  assert.match(graphHash(forward), /^[0-9a-f]{64}$/);
  const edited = inputs().map((input) =>
    input.path === "RULE-ASMT-AUTH.md" ? plainCarrier(input.path, `${input.source}\nOne more sentence.\n`) : input,
  );
  assert.notEqual(graphHash(validate(edited, registries).graph), graphHash(forward));
});

test("canonical JSON sorts keys recursively, keeps array order and has no whitespace", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, 1], c: null } }), '{"a":{"c":null,"d":[3,1]},"b":1}');
  assert.equal(canonicalJson({ a: undefined, b: "é" }), '{"b":"é"}');
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});
