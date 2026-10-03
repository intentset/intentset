import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_IGNORE,
  DEFAULT_SCOPE,
  type Diagnostic,
  type DocumentInput,
  EMPTY_REGISTRIES,
  compareDiagnostics,
  plainCarrier,
  readConfig,
  readRegistries,
  validate,
} from "../src/index.ts";
import { EXAMPLES_DIR } from "./cases.ts";

const dir = join(EXAMPLES_DIR, "scheduling");
const registriesText = readFileSync(join(dir, "registries.yaml"), "utf8");
const registries = readRegistries(registriesText, "registries.yaml").registries;
const baseline: DocumentInput[] = readdirSync(dir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => plainCarrier(name, readFileSync(join(dir, name), "utf8")));

test("the scheduling example validates at L1 and L2 with no diagnostics", () => {
  for (const level of ["L1", "L2"] as const) {
    const result = validate(baseline, registries, { level });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.ok, true);
    assert.equal(result.graph.artifacts.size, 13);
  }
});

test("every authored edge has one derived inverse, marked derived", () => {
  const { graph } = validate(baseline, registries);
  assert.equal(graph.edges.length, 17);
  assert.equal(graph.derived.length, graph.edges.length);
  assert.ok(graph.edges.every((e) => !e.derived));
  assert.ok(graph.derived.every((e) => e.derived));
  for (const edge of graph.edges) {
    assert.ok(graph.derived.some((d) => d.kind === edge.kind && d.from === edge.to && d.to === edge.from));
  }
  assert.deepEqual((graph.in.get("RULE-ASMT-FUTURE") ?? []).map((e) => `${e.kind}:${e.from}`).sort(), [
    "explains:KB-ASMT-SCHEDULE",
    "governedBy:BEH-ASMT-SCHEDULE",
    "verifies:TEST-ASMT-SCHEDULE",
  ]);
});

test("diagnostics are sorted and identical whatever order the files arrive in", () => {
  const broken = baseline.map((input) =>
    input.path === "BEH-ASMT-SCHEDULE.md"
      ? plainCarrier(
          input.path,
          input.source
            .replace("parent: CAP-ASMT-ASSIGN", "parent: CAP-MISSING")
            .replace("- RULE-ASMT-AUTH", "- CAP-ASMT-ASSIGN"),
        )
      : input.path === "SCN-ASMT-SCHEDULE.md"
        ? plainCarrier(input.path, input.source.replace("status: draft", "status: done"))
        : input,
  );
  const forward = validate(broken, EMPTY_REGISTRIES).diagnostics;
  const reverse = validate([...broken].reverse(), EMPTY_REGISTRIES).diagnostics;
  assert.ok(forward.length >= 4);
  assert.equal(JSON.stringify(forward), JSON.stringify(reverse));
  const sorted = [...forward].sort(compareDiagnostics);
  assert.deepEqual(forward, sorted);
});

test("syntax diagnostics from the carrier pass through with their origin", () => {
  const syntax: Diagnostic = {
    code: "MARKSET001",
    severity: "error",
    origin: "syntax",
    artifact: null,
    path: "ADR-ASMT-SEAM.md",
    location: { line: 20 },
    message: "An unclosed directive fence.",
    remediation: "Close the fence.",
  };
  const inputs = baseline.map((input) => (input.path === "ADR-ASMT-SEAM.md" ? { ...input, syntax: [syntax] } : input));
  const result = validate(inputs, registries);
  assert.deepEqual(result.diagnostics, [syntax]);
  assert.equal(result.ok, false);
});

test("every diagnostic has the contract's shape: one-sentence message and remediation", () => {
  const broken = baseline.map((input) =>
    input.path === "BEH-ASMT-SCHEDULE.md"
      ? plainCarrier(input.path, input.source.replace("owner: team-assessment", "owner: team-ghost"))
      : input,
  );
  const [d] = validate(broken, registries).diagnostics;
  assert.deepEqual(Object.keys(d), [
    "code",
    "severity",
    "origin",
    "artifact",
    "path",
    "location",
    "field",
    "message",
    "remediation",
  ]);
  assert.equal(d.code, "CORE005");
  assert.equal(d.origin, "graph");
  assert.deepEqual(d.location, { line: 10 });
  assert.match(d.message, /^[^.]+\.$/);
});

test("readRegistries reads the example, sorts it, and treats a missing file as empty", () => {
  const read = readRegistries(registriesText, "registries.yaml");
  assert.deepEqual(read.diagnostics, []);
  assert.deepEqual(read.registries.owners, ["team-assessment", "team-platform"]);
  assert.deepEqual(read.registries.resources, [
    {
      id: "RES-ASSESSMENT-DATA",
      path: "amplify/data/resource.ts",
      owner: "team-platform",
      consumers: ["SLICE-ASMT-SCHEDULE"],
    },
  ]);
  assert.deepEqual(readRegistries(null, "registries.yaml"), { registries: EMPTY_REGISTRIES, diagnostics: [] });
  assert.deepEqual(readRegistries("", "registries.yaml").registries, EMPTY_REGISTRIES);
});

test("readRegistries reports a bad shape as CFG002 with its line", () => {
  const read = readRegistries("owners: [a, a]\nresources:\n- id: lower\n  path: x\n  owner: o\n", "registries.yaml");
  assert.deepEqual(
    read.diagnostics.map((d) => [d.code, d.field, d.location?.line]),
    [
      ["CFG002", "/owners/1", 1],
      ["CFG002", "/resources/0/id", 3],
    ],
  );
  const unparsed = readRegistries("owners: [a\n", "registries.yaml");
  assert.equal(unparsed.diagnostics[0].origin, "syntax");
});

test("readConfig applies defaults and reports CFG001", () => {
  const good = readConfig("repository: intentset/intentset\nregistries: registries.yaml\n", ".intentset/config.yaml");
  assert.deepEqual(good.diagnostics, []);
  assert.deepEqual(good.config, {
    repository: "intentset/intentset",
    scope: DEFAULT_SCOPE,
    registries: "registries.yaml",
    ignore: DEFAULT_IGNORE,
  });
  assert.deepEqual(DEFAULT_SCOPE, ["**/*.md"]);
  assert.deepEqual(DEFAULT_IGNORE, ["node_modules/**", "dist/**", ".git/**"]);
  const bad = readConfig("scope: '**/*.md'\nextra: 1\nregistries: 3\n", ".intentset/config.yaml");
  assert.deepEqual(
    bad.diagnostics.map((d) => [d.code, d.field]),
    [
      ["CFG001", "/extra"],
      ["CFG001", "/repository"],
      ["CFG001", "/scope"],
      ["CFG001", "/registries"],
    ],
  );
  assert.deepEqual(bad.config.scope, DEFAULT_SCOPE);
  assert.equal(bad.config.registries, null);
});
