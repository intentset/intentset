import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { EXPORT_CONTRACT, readExport } from "@intentset/core";
import {
  type AcceptExpectation,
  buildConsumerFixtures,
  CONSUMER_DIR,
  type ConsumerManifest,
  MANIFEST,
} from "../src/consumer.ts";
import { type Schema, validateSchema } from "../src/schema.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const schema = JSON.parse(readFileSync(join(root, "spec", "export.schema.json"), "utf8")) as Schema;
const manifest = JSON.parse(readFileSync(join(CONSUMER_DIR, MANIFEST), "utf8")) as ConsumerManifest;
const read = (file: string) => readFileSync(join(CONSUMER_DIR, file), "utf8");

test("tests/consumer/ is exactly what the recipe builds: run `npm run fixtures:consumer` after changing either", () => {
  const built = buildConsumerFixtures();
  assert.deepEqual(readdirSync(CONSUMER_DIR).sort(), [...built.keys()].sort());
  for (const [name, text] of built) assert.equal(read(name), text, `${name} differs from what the recipe builds`);
});

test("the manifest names the contract, and every case a file that exists", () => {
  assert.equal(manifest.contract, EXPORT_CONTRACT);
  const files = new Set(readdirSync(CONSUMER_DIR));
  const names = new Set<string>();
  for (const c of manifest.cases) {
    assert.ok(files.has(c.file), c.file);
    assert.ok(!names.has(c.name), `repeated case name ${c.name}`);
    names.add(c.name);
    assert.match(c.notes, /\.$/);
  }
  const categories = new Set(manifest.cases.flatMap((c) => (c.expect.accept ? [] : [c.expect.category])));
  // The integration contract's list: unsupported versions, mismatched identity, stale evidence, forbidden
  // content and missing optional reports, plus what a reader must refuse before any of those.
  for (const category of [
    "not-json",
    "unsupported-contract",
    "malformed",
    "identity-mismatch",
    "mixed-snapshot",
    "forbidden-content",
    "inconsistent-report",
  ]) {
    assert.ok(categories.has(category), category);
  }
  const accepted = manifest.cases.filter((c) => c.expect.accept).map((c) => c.expect as AcceptExpectation);
  assert.ok(
    accepted.some((e) => e.supplied.length === 0),
    "a case with every report missing",
  );
  assert.ok(
    accepted.some((e) => e.evidence?.["TEST-ASMT-SCHEDULE"] === "stale"),
    "a case with stale evidence",
  );
});

for (const c of manifest.cases) {
  test(`reader: ${c.name} (${c.file})`, () => {
    const result = readExport(read(c.file), c.connection);
    if (!c.expect.accept) {
      assert.equal(result.ok, false, `${c.file} was accepted`);
      if (!result.ok) assert.equal(result.category, c.expect.category, JSON.stringify(result.problems));
      return;
    }
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.problems));
    if (!result.ok) return;
    const expected = c.expect;
    const envelope = result.envelope;
    assert.deepEqual(result.supplied, expected.supplied);
    assert.deepEqual({ commit: envelope.source.commit, graphHash: envelope.graphHash }, expected.snapshot);
    assert.equal(envelope.validation.status, expected.validation);
    assert.equal(envelope.withholding.artifacts, expected.withheldArtifacts);
    if (expected.evidence !== undefined) {
      const statuses = Object.fromEntries(
        (envelope.reports.evidence?.verifications ?? []).map((v) => [v.id, v.status]),
      );
      assert.deepEqual(statuses, expected.evidence);
    }
  });
}

test("the schema accepts every accepted envelope, and rejects the malformed and unsupported ones", () => {
  for (const c of manifest.cases) {
    if (c.file.endsWith(".txt")) continue;
    const errors = validateSchema(schema, JSON.parse(read(c.file)));
    if (c.expect.accept || !["malformed", "unsupported-contract"].includes(c.expect.category)) {
      assert.deepEqual(errors, [], `${c.file} should be schema-valid`);
    } else {
      assert.ok(errors.length > 0, `${c.file} passed the schema`);
    }
  }
});

test("the schema alone is not enough: identity, snapshot, withholding and consistency are the reader's", () => {
  // These envelopes are schema-valid, and a consumer must still refuse them (spec/export.md §5).
  const beyond = manifest.cases.filter(
    (c) =>
      !c.expect.accept &&
      ["identity-mismatch", "mixed-snapshot", "forbidden-content", "inconsistent-report"].includes(c.expect.category),
  );
  assert.ok(beyond.length >= 5);
  for (const c of beyond) assert.deepEqual(validateSchema(schema, JSON.parse(read(c.file))), [], c.file);
});

test("same commit and graph hash is the same snapshot, whatever the generation time", () => {
  const a = readExport(read("full.json"));
  const b = readExport(read("full-regenerated.json"));
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.notEqual(a.envelope.generatedAt, b.envelope.generatedAt);
  const { generatedAt: _a, ...restA } = a.envelope;
  const { generatedAt: _b, ...restB } = b.envelope;
  assert.deepEqual(restA, restB);
});
