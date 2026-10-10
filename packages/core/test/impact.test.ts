import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type DocumentInput, impact, plainCarrier, readRegistries, validate } from "../src/index.ts";
import { EXAMPLES_DIR } from "./cases.ts";

const dir = join(EXAMPLES_DIR, "scheduling");
const registries = readRegistries(readFileSync(join(dir, "registries.yaml"), "utf8"), "registries.yaml").registries;
const baseline: DocumentInput[] = readdirSync(dir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => plainCarrier(name, readFileSync(join(dir, name), "utf8")));

const ids = (hits: { id: string }[]) => hits.map((h) => h.id);

test("BEH-IMPACT: a rule change reaches its behavior, verifications and knowledge directly, owners and scenarios beyond", () => {
  const report = impact(validate(baseline, registries).graph, "RULE-ASMT-FUTURE");
  assert.equal(report.start, "RULE-ASMT-FUTURE");
  assert.deepEqual(ids(report.direct), ["BEH-ASMT-SCHEDULE", "KB-ASMT-SCHEDULE", "TEST-ASMT-SCHEDULE"]);
  assert.deepEqual(ids(report.candidates), ["SCN-ASMT-SCHEDULE", "SLICE-ASMT-SCHEDULE"]);
  assert.deepEqual(report.context, []);
  assert.deepEqual(report.ancestors, []);
  const slice = report.candidates.find((h) => h.id === "SLICE-ASMT-SCHEDULE");
  assert.deepEqual(
    slice?.path.map((s) => [s.id, s.via, s.reason]),
    [
      ["BEH-ASMT-SCHEDULE", "governedBy←", "BEH-ASMT-SCHEDULE is governed by RULE-ASMT-FUTURE."],
      ["SLICE-ASMT-SCHEDULE", "implements←", "SLICE-ASMT-SCHEDULE implements BEH-ASMT-SCHEDULE."],
    ],
  );
});

test("a behavior shows its rules as context and its capability chain as ancestors", () => {
  const report = impact(validate(baseline, registries).graph, "BEH-ASMT-SCHEDULE");
  assert.deepEqual(ids(report.direct), [
    "KB-ASMT-SCHEDULE",
    "SCN-ASMT-SCHEDULE",
    "SLICE-ASMT-SCHEDULE",
    "TEST-ASMT-SCHEDULE",
  ]);
  assert.deepEqual(ids(report.candidates), []);
  assert.deepEqual(ids(report.context), ["RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"]);
  assert.equal(report.context[0].path[0].via, "governedBy→");
  assert.deepEqual(report.ancestors, ["CAP-ASMT-ASSIGN", "OUT-PREPARE", "INT-PREPARE", "PRD-LANTERN"]);
});

test("a slice's contracts and decisions are context", () => {
  const report = impact(validate(baseline, registries).graph, "SLICE-ASMT-SCHEDULE");
  assert.deepEqual(ids(report.context), ["ADR-ASMT-SEAM", "CONTRACT-ASMT-SCHEDULE"]);
  assert.deepEqual(ids(report.direct), []);
});

test("reverse slice dependencies are followed transitively, and a cycle terminates", () => {
  const slice = (id: string, dependsOn: string[]) =>
    plainCarrier(
      `${id}.md`,
      `---\nmarkset: 0\nintentset:\n  spec: '0.1'\n  profile: intentset/slice/0.1\n  id: ${id}\n  type: slice\n  title: ${id}\n  status: draft\n  owner: team-assessment\n  visibility: internal\n  audiences: [engineering]\n  links:\n    dependsOn: [${dependsOn.join(", ")}]\n  slice:\n    kind: technical\n    rationale: Shared.\n    domain: d\n    entrypoints: [src/${id}.ts]\n    layers: {}\n    claims: []\n    usesResources: []\n---\n# ${id}\n## Responsibility\n## Public contract\n## Verification\n`,
    );
  const graph = validate(
    [
      ...baseline,
      slice("SLICE-A", ["SLICE-ASMT-SCHEDULE"]),
      slice("SLICE-B", ["SLICE-A"]),
      slice("SLICE-C", ["SLICE-B", "SLICE-C2"]),
      slice("SLICE-C2", ["SLICE-C"]),
    ],
    registries,
  ).graph;
  const report = impact(graph, "SLICE-ASMT-SCHEDULE");
  assert.deepEqual(ids(report.direct), ["SLICE-A"]);
  assert.deepEqual(ids(report.candidates), ["SLICE-B", "SLICE-C", "SLICE-C2"]);
  const c2 = report.candidates.find((h) => h.id === "SLICE-C2");
  assert.deepEqual(
    c2?.path.map((s) => s.id),
    ["SLICE-A", "SLICE-B", "SLICE-C", "SLICE-C2"],
  );
});

test("an unknown ID yields an empty report, and the report is deterministic", () => {
  const graph = validate(baseline, registries).graph;
  assert.deepEqual(impact(graph, "NOPE-1"), {
    start: "NOPE-1",
    direct: [],
    candidates: [],
    context: [],
    ancestors: [],
  });
  const reversed = validate([...baseline].reverse(), registries).graph;
  assert.equal(JSON.stringify(impact(graph, "PRD-LANTERN")), JSON.stringify(impact(reversed, "PRD-LANTERN")));
});

test("everything that navigates to the product, and its dependents, is a candidate; rules and decisions are not", () => {
  const report = impact(validate(baseline, registries).graph, "PRD-LANTERN");
  assert.deepEqual(ids(report.direct), ["INT-PREPARE"]);
  assert.deepEqual(ids(report.candidates), [
    "BEH-ASMT-SCHEDULE",
    "CAP-ASMT-ASSIGN",
    "KB-ASMT-SCHEDULE",
    "MEAS-PREPARE-ADOPTION",
    "MEAS-PREPARE-MINUTES",
    "OUT-PREPARE",
    "SCN-ASMT-SCHEDULE",
    "SLICE-ASMT-SCHEDULE",
    "TEST-ASMT-SCHEDULE",
  ]);
  for (const hit of report.candidates) {
    assert.equal(hit.path[hit.path.length - 1].id, hit.id);
    assert.ok(hit.path.every((step) => step.reason.endsWith(".")));
  }
});
