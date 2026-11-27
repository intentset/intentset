import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_IGNORE,
  DEFAULT_SCOPE,
  DOCUMENT_MAX_BYTES,
  type Diagnostic,
  type DocumentInput,
  EMPTY_REGISTRIES,
  compareDiagnostics,
  plainCarrier,
  readArtifact,
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
    assert.equal(result.graph.artifacts.size, 15);
  }
});

test("every authored edge has one derived inverse, marked derived", () => {
  const { graph } = validate(baseline, registries);
  assert.equal(graph.edges.length, 19);
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

test("BEH-VALIDATE-REPORTS: diagnostics are sorted and identical whatever order the files arrive in", () => {
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

test("BEH-VALIDATE-REPORTS: a code names one kind of thing to fix (Core §11, ADR 0024)", () => {
  const errorsWith = (edits: Record<string, (source: string) => string>) =>
    validate(
      baseline.map((input) => {
        const edit = edits[input.path];
        return edit === undefined ? input : plainCarrier(input.path, edit(input.source));
      }),
      registries,
    )
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.code);
  const behavior = (edit: (source: string) => string) => ({ "BEH-ASMT-SCHEDULE.md": edit });

  // The carrier cannot be read: a repeated key, or no frontmatter at all.
  assert.deepEqual(errorsWith({ "ADR-ASMT-SEAM.md": (s) => s.replace("  status: draft\n", "$&  status: draft\n") }), [
    "CORE010",
  ]);
  // With no frontmatter no ID is declared either, so the slice's informedBy no longer resolves.
  assert.deepEqual(errorsWith({ "ADR-ASMT-SEAM.md": (s) => s.replace(/^---\n/, "") }), ["CORE010", "CORE003"]);
  // A heading the record requires is missing.
  assert.deepEqual(errorsWith({ "RULE-ASMT-FUTURE.md": (s) => s.replace("## Constraint", "## Limit") }), ["CORE011"]);
  // A field is unknown or the wrong shape.
  assert.deepEqual(errorsWith(behavior((s) => s.replace("  revision: 1\n", "  revision: one\n"))), ["CORE001"]);
  // A link names the wrong type.
  assert.deepEqual(errorsWith(behavior((s) => s.replace("    - RULE-ASMT-AUTH\n", "    - CAP-ASMT-ASSIGN\n"))), [
    "CORE003",
  ]);
  // A record past draft lacks a relationship it must have.
  assert.deepEqual(
    errorsWith({
      ...behavior((s) => s.replace("    - RULE-ASMT-AUTH\n", "")),
      "RULE-ASMT-AUTH.md": (s) => s.replace("  status: draft", "  status: approved"),
    }),
    ["CORE012"],
  );
});

test("BEH-MARKSET-CARRIER: syntax diagnostics from the carrier pass through with their origin", () => {
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

test("BEH-VALIDATE-REPORTS: every diagnostic has the contract's shape: one-sentence message and remediation", () => {
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
  // "syntax" is Markset's origin alone (ADR 0004); a YAML rejection here is Intentset's own.
  assert.equal(unparsed.diagnostics[0].origin, "profile");
});

test("readConfig applies defaults and reports CFG001", () => {
  const good = readConfig("repository: intentset/intentset\nregistries: registries.yaml\n", ".intentset/config.yaml");
  assert.deepEqual(good.diagnostics, []);
  assert.deepEqual(good.config, {
    repository: "intentset/intentset",
    scope: DEFAULT_SCOPE,
    registries: "registries.yaml",
    ignore: DEFAULT_IGNORE,
    evidence: { binding: null, globalInputs: [] },
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

test("BEH-EVIDENCE-CURRENT: evidence in the configuration names the binding and the global inputs, each optional, and nothing else", () => {
  const read = (evidence: string) =>
    readConfig(`repository: example/x\nevidence:\n${evidence}`, ".intentset/config.yaml");
  const both = read(
    "  binding: commit\n  globalInputs:\n    - pnpm-lock.yaml\n    - tsconfig*.json\n    - pnpm-lock.yaml\n",
  );
  assert.deepEqual(both.diagnostics, []);
  assert.deepEqual(both.config.evidence, { binding: "commit", globalInputs: ["pnpm-lock.yaml", "tsconfig*.json"] });
  assert.deepEqual(read("  binding: subject\n").config.evidence, { binding: "subject", globalInputs: [] });
  assert.deepEqual(read("  globalInputs: []\n").diagnostics, []);

  const bad = (evidence: string) => read(evidence).diagnostics.map((d) => [d.code, d.field]);
  assert.deepEqual(bad("  binding: graph\n"), [["CFG001", "/evidence/binding"]]);
  // ADR 0026: the two keys that changed what a subject holds are unknown keys, at every value they took.
  for (const removed of [
    "resources: used",
    "resources: exercised",
    "dependencies: entrypoint",
    "dependencies: files",
  ]) {
    const key = removed.split(":")[0];
    const found = read(`  ${removed}\n`);
    assert.deepEqual(
      found.diagnostics.map((d) => [d.code, d.field]),
      [["CFG001", `/evidence/${key}`]],
    );
    assert.match(found.diagnostics[0].remediation, /ADR 0026/);
    assert.deepEqual(found.config.evidence, { binding: null, globalInputs: [] });
  }
  assert.deepEqual(bad("  globalInputs: pnpm-lock.yaml\n"), [["CFG001", "/evidence/globalInputs"]]);
  assert.deepEqual(bad("  globalInputs:\n    - ../outside\n"), [["CFG001", "/evidence/globalInputs/0"]]);
  assert.deepEqual(bad("  other: 1\n"), [["CFG001", "/evidence/other"]]);
  assert.deepEqual(
    readConfig("repository: example/x\nevidence: yes\n", "c").diagnostics.map((d) => d.field),
    ["/evidence"],
  );
});
test("Core §3: a record over the size limit is refused before it is parsed", () => {
  const big = `---\nmarkset: 0\n---\n\n# Big\n\n${"x".repeat(DOCUMENT_MAX_BYTES)}\n`;
  const read = readArtifact(plainCarrier("BIG.md", big));
  assert.equal(read.artifact, null);
  assert.deepEqual(
    read.diagnostics.map((d) => [d.code, d.origin]),
    [["CORE010", "profile"]],
  );
  assert.match(read.diagnostics[0].message, /MiB/);
});

test("a scope or ignore pattern the matcher cannot honour is CFG001, not silently empty", () => {
  const read = readConfig(
    "repository: a/b\nscope:\n- /abs/**/*.md\n- 'docs/{a,b}/*.md'\nignore:\n- '!keep/**'\n",
    "c.yaml",
  );
  assert.deepEqual(
    read.diagnostics.map((d) => [d.code, d.field]),
    [
      ["CFG001", "/scope/0"],
      ["CFG001", "/scope/1"],
      ["CFG001", "/ignore/0"],
    ],
  );
});

test("a slice missing layers or usesResources is told what to write when there are none, and the empty values validate (VSA §3)", () => {
  const slice = baseline.find((input) => input.path === "SLICE-ASMT-SCHEDULE.md")!;
  const layers = /^ {4}layers:\n(?: {6,}.*\n)+/m;
  const resources = /^ {4}usesResources:.*\n(?: {4}- .*\n)*/m;
  assert.match(slice.source, layers);
  assert.match(slice.source, resources);

  const without = readArtifact(plainCarrier(slice.path, slice.source.replace(layers, "").replace(resources, "")));
  assert.deepEqual(
    without.diagnostics.map((d) => `${d.code} ${d.field}`),
    ["CORE001 /intentset/slice/layers", "CORE001 /intentset/slice/usesResources"],
  );
  assert.match(without.diagnostics[0].remediation, /write `layers: \{\}`.*never invent a layer/);
  assert.match(without.diagnostics[1].remediation, /write `usesResources: \[\]`/);

  const empty = readArtifact(
    plainCarrier(
      slice.path,
      slice.source.replace(layers, "    layers: {}\n").replace(resources, "    usesResources: []\n"),
    ),
  );
  assert.deepEqual(empty.diagnostics, []);
  assert.deepEqual(empty.artifact?.meta.slice?.layers, {});
  assert.deepEqual(empty.artifact?.meta.slice?.usesResources, []);
});

test("a slice's entrypoints are a list; the earlier single key is unknown, and each entry is checked as a path", () => {
  const slice = baseline.find((input) => input.path === "SLICE-ASMT-SCHEDULE.md")!;
  const entry = "src/features/assessment/schedule/index.ts";
  const listed = `    entrypoints:\n    - ${entry}\n`;
  assert.ok(slice.source.includes(listed));
  const withSource = (source: string) => [
    ...baseline.filter((input) => input !== slice),
    plainCarrier(slice.path, source),
  ];

  const flow = validate(
    withSource(slice.source.replace(listed, `    entrypoints: [${entry}, apps/web/index.ts]\n`)),
    registries,
  );
  assert.deepEqual(flow.diagnostics, []);
  assert.deepEqual(flow.graph.artifacts.get("SLICE-ASMT-SCHEDULE")?.meta.slice?.entrypoints, [
    entry,
    "apps/web/index.ts",
  ]);

  const old = readArtifact(plainCarrier(slice.path, slice.source.replace(listed, `    entrypoint: ${entry}\n`)));
  assert.deepEqual(
    old.diagnostics.map((d) => `${d.code} ${d.field}`),
    ["CORE001 /intentset/slice/entrypoint", "CORE001 /intentset/slice/entrypoints"],
  );
  assert.match(old.diagnostics[0].remediation, /write `entrypoints: \[path\]`/);

  const climbing = validate(withSource(slice.source.replace(listed, `${listed}    - ../web/index.ts\n`)), registries);
  assert.deepEqual(
    climbing.diagnostics.map((d) => `${d.code} ${d.field} ${d.message}`),
    ["CORE001 /intentset/slice/entrypoints/1 Entrypoint ../web/index.ts contains `..`."],
  );
});
