import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  type ContextBundle,
  type DocumentInput,
  type Graph,
  contextFor,
  plainCarrier,
  readRegistries,
  validate,
} from "../src/index.ts";
import { EXAMPLES_DIR } from "./cases.ts";

const dir = join(EXAMPLES_DIR, "scheduling");
const registries = readRegistries(readFileSync(join(dir, "registries.yaml"), "utf8"), "registries.yaml").registries;
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => ({ name, source: readFileSync(join(dir, name), "utf8") }));

function graphOf(edit: (name: string, source: string) => string = (_, source) => source, reverse = false): Graph {
  const inputs: DocumentInput[] = files.map(({ name, source }) =>
    plainCarrier(`examples/scheduling/${name}`, edit(name, source)),
  );
  if (reverse) inputs.reverse();
  const result = validate(inputs, registries);
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join("\n"));
  return result.graph;
}

const graph = graphOf();

/** The bundle as `role id` lines, which is what a reader of a failure wants to see. */
function roles(bundle: ContextBundle | null): string[] {
  assert.ok(bundle !== null);
  return bundle.artifacts.map((a) => `${a.role} ${a.id}`);
}

test("a behavior's bundle: owner, rules, scenarios, verifications, contracts, decisions, knowledge, ancestors", () => {
  const bundle = contextFor(graph, "BEH-ASMT-SCHEDULE");
  assert.deepEqual(roles(bundle), [
    "start BEH-ASMT-SCHEDULE",
    "owner SLICE-ASMT-SCHEDULE",
    "rule RULE-ASMT-AUTH",
    "rule RULE-ASMT-FUTURE",
    "scenario SCN-ASMT-SCHEDULE",
    "verification TEST-ASMT-SCHEDULE",
    "contract CONTRACT-ASMT-SCHEDULE",
    "decision ADR-ASMT-SEAM",
    "knowledge KB-ASMT-SCHEDULE",
    "ancestor CAP-ASMT-ASSIGN",
    "ancestor INT-PREPARE",
    "ancestor OUT-PREPARE",
    "ancestor PRD-LANTERN",
  ]);
  assert.equal(bundle?.withheld, 0);
  assert.deepEqual(bundle?.artifacts[0], {
    id: "BEH-ASMT-SCHEDULE",
    type: "behavior",
    title: "Schedule an assessment",
    status: "draft",
    visibility: "internal",
    path: "examples/scheduling/BEH-ASMT-SCHEDULE.md",
    role: "start",
  });
});

test("a rule's bundle: the behaviors it governs, their owners and verifications, and what names the rule", () => {
  assert.deepEqual(roles(contextFor(graph, "RULE-ASMT-FUTURE")), [
    "start RULE-ASMT-FUTURE",
    "owner SLICE-ASMT-SCHEDULE",
    "behavior BEH-ASMT-SCHEDULE",
    "verification TEST-ASMT-SCHEDULE",
    "knowledge KB-ASMT-SCHEDULE",
  ]);
});

test("a capability's bundle merges its behaviors' bundles; the start keeps its role over ancestor", () => {
  assert.deepEqual(roles(contextFor(graph, "CAP-ASMT-ASSIGN")), [
    "start CAP-ASMT-ASSIGN",
    "owner SLICE-ASMT-SCHEDULE",
    "behavior BEH-ASMT-SCHEDULE",
    "rule RULE-ASMT-AUTH",
    "rule RULE-ASMT-FUTURE",
    "scenario SCN-ASMT-SCHEDULE",
    "verification TEST-ASMT-SCHEDULE",
    "contract CONTRACT-ASMT-SCHEDULE",
    "decision ADR-ASMT-SEAM",
    "knowledge KB-ASMT-SCHEDULE",
    "ancestor INT-PREPARE",
    "ancestor OUT-PREPARE",
    "ancestor PRD-LANTERN",
  ]);
});

test("a slice's bundle merges its implemented behaviors' bundles; the start keeps its role over owner", () => {
  assert.deepEqual(roles(contextFor(graph, "SLICE-ASMT-SCHEDULE")), [
    "start SLICE-ASMT-SCHEDULE",
    "behavior BEH-ASMT-SCHEDULE",
    "rule RULE-ASMT-AUTH",
    "rule RULE-ASMT-FUTURE",
    "scenario SCN-ASMT-SCHEDULE",
    "verification TEST-ASMT-SCHEDULE",
    "contract CONTRACT-ASMT-SCHEDULE",
    "decision ADR-ASMT-SEAM",
    "knowledge KB-ASMT-SCHEDULE",
    "ancestor CAP-ASMT-ASSIGN",
    "ancestor INT-PREPARE",
    "ancestor OUT-PREPARE",
    "ancestor PRD-LANTERN",
  ]);
});

test("any other type: the artifact and its direct authored and derived neighbours", () => {
  assert.deepEqual(roles(contextFor(graph, "ADR-ASMT-SEAM")), ["start ADR-ASMT-SEAM", "neighbour SLICE-ASMT-SCHEDULE"]);
  assert.deepEqual(roles(contextFor(graph, "KB-ASMT-SCHEDULE")), [
    "start KB-ASMT-SCHEDULE",
    "neighbour BEH-ASMT-SCHEDULE",
    "neighbour RULE-ASMT-AUTH",
    "neighbour RULE-ASMT-FUTURE",
  ]);
  assert.deepEqual(roles(contextFor(graph, "OUT-PREPARE")), [
    "start OUT-PREPARE",
    "neighbour CAP-ASMT-ASSIGN",
    "neighbour INT-PREPARE",
    "neighbour MEAS-PREPARE-ADOPTION",
    "neighbour MEAS-PREPARE-MINUTES",
  ]);
});

test("an unknown ID has no context", () => {
  assert.equal(contextFor(graph, "BEH-NOPE"), null);
});

test("restricted artifacts are withheld and counted, unless included", () => {
  const restricted = graphOf((name, source) =>
    name === "RULE-ASMT-AUTH.md" || name === "ADR-ASMT-SEAM.md"
      ? source.replace("visibility: internal", "visibility: restricted")
      : source,
  );
  const withheld = contextFor(restricted, "BEH-ASMT-SCHEDULE");
  assert.equal(withheld?.withheld, 2);
  assert.ok(!roles(withheld).includes("rule RULE-ASMT-AUTH"));
  assert.ok(!roles(withheld).includes("decision ADR-ASMT-SEAM"));

  const included = contextFor(restricted, "BEH-ASMT-SCHEDULE", { includeRestricted: true });
  assert.equal(included?.withheld, 0);
  assert.ok(roles(included).includes("rule RULE-ASMT-AUTH"));
  assert.equal(included?.artifacts.find((a) => a.id === "ADR-ASMT-SEAM")?.visibility, "restricted");

  // The start is withheld like any other artifact: its ID is the caller's own, nothing else of it is shown.
  const fromRestricted = contextFor(restricted, "RULE-ASMT-AUTH");
  assert.equal(fromRestricted?.start, "RULE-ASMT-AUTH");
  assert.ok(!fromRestricted?.artifacts.some((a) => a.id === "RULE-ASMT-AUTH"));
  assert.equal(fromRestricted?.withheld, 1);
});

test("deterministic: the same graph read in another file order gives the same bundle", () => {
  const reversed = graphOf(undefined, true);
  for (const id of graph.artifacts.keys()) {
    assert.deepEqual(contextFor(reversed, id), contextFor(graph, id), id);
  }
});
