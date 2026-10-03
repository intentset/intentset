/**
 * readArtifact against the normative frontmatter schema (ADR 0002): for every
 * example document and every document in every fixture, the JSON Schema
 * evaluator and the typed checks agree on whether the frontmatter is valid.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseYaml, plainCarrier, readArtifact, sha256Hex } from "../src/index.ts";
import { EXAMPLES_DIR, SPEC_DIR, expandCase, loadSection, readJson } from "./cases.ts";
import { type Schema, validateSchema } from "./schema.ts";

const frontmatterSchema = readJson(join(SPEC_DIR, "frontmatter.schema.json")) as Schema;

interface Verdict {
  schemaValid: boolean;
  schemaErrors: string[];
  codeValid: boolean;
  codeErrors: string[];
}

/** Null when the document has no frontmatter the reader accepts; the schema does not apply there. */
function verdict(path: string, source: string): Verdict | null {
  const input = plainCarrier(path, source);
  const { diagnostics } = readArtifact(input);
  if (input.frontmatter === null) {
    assert.ok(
      diagnostics.some((d) => d.code === "CORE001"),
      `${path}: no frontmatter must be CORE001`,
    );
    return null;
  }
  const parsed = parseYaml(input.frontmatter.text);
  if (parsed.error) {
    assert.ok(
      diagnostics.some((d) => d.code === "CORE001"),
      `${path}: a rejected YAML must be CORE001`,
    );
    return null;
  }
  const schemaErrors = validateSchema(frontmatterSchema, parsed.value);
  // Frontmatter diagnostics carry a field; the Core §6 narrative ones do not, and the schema cannot see narrative.
  const frontmatterErrors = diagnostics.filter((d) => d.severity === "error" && d.field !== undefined);
  return {
    schemaValid: schemaErrors.length === 0,
    schemaErrors: schemaErrors.map((e) => `${e.instance} ${e.keyword}: ${e.message}`),
    codeValid: frontmatterErrors.length === 0,
    codeErrors: frontmatterErrors.map((d) => `${d.code} ${d.field}: ${d.message}`),
  };
}

function exampleDocuments(): [string, string][] {
  const out: [string, string][] = [];
  for (const dir of readdirSync(EXAMPLES_DIR).sort()) {
    for (const name of readdirSync(join(EXAMPLES_DIR, dir)).sort()) {
      if (name.endsWith(".md")) out.push([`${dir}/${name}`, readFileSync(join(EXAMPLES_DIR, dir, name), "utf8")]);
    }
  }
  return out;
}

test("every example document is valid under both the schema and readArtifact", () => {
  const documents = exampleDocuments();
  assert.ok(documents.length >= 13);
  for (const [path, source] of documents) {
    const v = verdict(path, source);
    assert.ok(v !== null, path);
    assert.deepEqual(v.schemaErrors, [], path);
    assert.deepEqual(v.codeErrors, [], path);
  }
});

test("the schema and readArtifact agree on every fixture document", () => {
  let checked = 0;
  let invalid = 0;
  const seen = new Set<string>();
  for (const section of ["core", "export"]) {
    for (const testCase of loadSection(section)) {
      for (const [path, source] of expandCase(testCase).files) {
        if (!path.endsWith(".md")) continue;
        const key = sha256Hex(source);
        if (seen.has(key)) continue;
        seen.add(key);
        const v = verdict(path, source);
        if (v === null) continue;
        checked++;
        if (!v.schemaValid) invalid++;
        assert.equal(
          v.codeValid,
          v.schemaValid,
          `${testCase.name}, ${path}: schema says ${v.schemaValid ? "valid" : "invalid"} (${v.schemaErrors.join("; ")}), readArtifact says ${v.codeValid ? "valid" : "invalid"} (${v.codeErrors.join("; ")})`,
        );
      }
    }
  }
  assert.ok(checked > 50, `only ${checked} distinct documents checked`);
  assert.ok(invalid > 25, `only ${invalid} schema-invalid documents among them`);
});

test("an artifact keeps its foreign keys, its body and the hash of its bytes", () => {
  const source =
    "---\nmarkset: 0\nx-editor:\n  theme: dark\nintentset:\n  spec: '0.1'\n  profile: intentset/product/0.1\n  id: PRD-X\n  type: product\n  title: X\n  status: draft\n  owner: o\n  visibility: internal\n  audiences: [a]\n---\n\n# X\n\n## Scope\n\nText.\n";
  const { artifact, diagnostics } = readArtifact(plainCarrier("PRD-X.md", source));
  assert.deepEqual(diagnostics, []);
  assert.ok(artifact !== null);
  assert.deepEqual(artifact.foreign, { "x-editor": { theme: "dark" } });
  assert.equal(artifact.body, "\n# X\n\n## Scope\n\nText.\n");
  assert.equal(artifact.sourceHash, sha256Hex(source));
  assert.equal(artifact.meta.id, "PRD-X");
  assert.deepEqual(artifact.meta.links, {});
});

test("diagnostics carry origin profile, a JSON pointer and the file line of the key", () => {
  const source = readFileSync(join(EXAMPLES_DIR, "scheduling", "BEH-ASMT-SCHEDULE.md"), "utf8").replace(
    "  status: draft",
    "  status: done",
  );
  const { artifact, diagnostics } = readArtifact(plainCarrier("BEH-ASMT-SCHEDULE.md", source));
  assert.equal(artifact, null);
  assert.equal(diagnostics.length, 1);
  const [d] = diagnostics;
  assert.equal(d.code, "CORE001");
  assert.equal(d.origin, "profile");
  assert.equal(d.severity, "error");
  assert.equal(d.artifact, "BEH-ASMT-SCHEDULE");
  assert.equal(d.path, "BEH-ASMT-SCHEDULE.md");
  assert.equal(d.field, "/intentset/status");
  assert.deepEqual(d.location, { line: 9 });
  assert.ok(d.message.endsWith("."));
  assert.ok(d.remediation.length > 0);
});

test("a YAML rejection is located on its file line", () => {
  const source = "---\nmarkset: 0\nintentset:\n  id: PRD-X\n  id: PRD-Y\n---\n";
  const { artifact, diagnostics } = readArtifact(plainCarrier("PRD-X.md", source));
  assert.equal(artifact, null);
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0].location, { line: 5 });
  assert.equal(diagnostics[0].artifact, null);
});
