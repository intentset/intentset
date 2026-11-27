import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  type DocumentInput,
  SURFACE_ID_DIGITS,
  SURFACE_ID_PATTERN,
  exportGraph,
  isSurfaceId,
  parseYaml,
  plainCarrier,
  readExport,
  readRegistries,
  validate,
} from "../src/index.ts";
import { EXAMPLES_DIR } from "./cases.ts";

const dir = join(EXAMPLES_DIR, "scheduling");
const registries = readRegistries(readFileSync(join(dir, "registries.yaml"), "utf8"), "registries.yaml").registries;
const SLICE = "SLICE-ASMT-SCHEDULE.md";
const AVAILABILITY = [
  "  availability:",
  "    products: [PRD-LANTERN]",
  "    releases: [pilot-1]",
  "    roles: [teacher]",
  "    editions: [standard]",
  "    flags: []",
].join("\n");

/** The example with its slice's frontmatter given `surfaces` (YAML lines under `slice:`) and, unless told not to, availability. */
function tree(
  surfaces: string[],
  options: { availability?: boolean; extra?: DocumentInput[]; edit?: (name: string, text: string) => string } = {},
): DocumentInput[] {
  const out: DocumentInput[] = [];
  for (const name of readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()) {
    let text = readFileSync(join(dir, name), "utf8");
    if (name === SLICE) {
      text = text.replace(
        "    usesResources:\n    - RES-ASSESSMENT-DATA\n",
        `    usesResources:\n    - RES-ASSESSMENT-DATA\n${surfaces.map((line) => `    ${line}`).join("\n")}${surfaces.length > 0 ? "\n" : ""}`,
      );
      if (options.availability !== false) text = text.replace("  links:\n", `${AVAILABILITY}\n  links:\n`);
    }
    if (options.edit !== undefined) text = options.edit(name, text);
    out.push(plainCarrier(name, text));
  }
  return [...out, ...(options.extra ?? [])];
}

function codes(inputs: DocumentInput[]): string[] {
  return validate(inputs, registries).diagnostics.map((d) => `${d.code} ${d.artifact ?? ""} ${d.field ?? ""}`.trim());
}

const SCHEDULE = ["surfaces:", "  lantern-web:/assessments/schedule:", "    knowledge: [KB-ASMT-SCHEDULE]"];

test("BEH-SURFACES: a slice's surfaces are read in code-unit key order, each list in declared order", () => {
  const result = validate(
    tree([
      "surfaces:",
      "  lantern-web:/b:",
      "    knowledge: [KB-ASMT-SCHEDULE]",
      "  /1:",
      "    knowledge: [KB-ASMT-SCHEDULE]",
    ]),
    registries,
  );
  assert.deepEqual(result.diagnostics, []);
  const surfaces = result.graph.artifacts.get("SLICE-ASMT-SCHEDULE")?.meta.slice?.surfaces;
  assert.deepEqual(Object.keys(surfaces ?? {}), ["/1", "lantern-web:/b"]);
});

test("BEH-SURFACES: an empty map declares no surfaces and needs no availability", () => {
  assert.deepEqual(codes(tree(["surfaces: {}"], { availability: false })), []);
});

test("BEH-SURFACES: the surface ID rules, digits only, __proto__ and the six refused characters included", () => {
  assert.equal(SURFACE_ID_PATTERN.source, "^[!#-&(-;=?-\\[\\]-_a-~]{1,200}$");
  assert.equal(SURFACE_ID_DIGITS.source, "^[0-9]+$");
  for (const key of [
    "@lantern/assessments#/review",
    "/students/:id",
    "/students/[id]",
    "/students/{id}",
    "1a",
    "/1",
    "a".repeat(200),
  ]) {
    assert.equal(isSurfaceId(key), true, key);
  }
  for (const key of ["", "a".repeat(201), "404", "__proto__", "a b", "/é", 'a"b', "a'b", "a<b", "a>b", "a\\b", "a`b"]) {
    assert.equal(isSurfaceId(key), false, key);
  }
});

test("BEH-SURFACES: every malformed surfaces is CORE001 at its field", () => {
  const cases: [string[], string][] = [
    [["surfaces: [KB-ASMT-SCHEDULE]"], "/intentset/slice/surfaces"],
    [["surfaces:", "  '404':", "    knowledge: [KB-ASMT-SCHEDULE]"], "/intentset/slice/surfaces/404"],
    [["surfaces:", "  x: {}"], "/intentset/slice/surfaces/x/knowledge"],
    [
      ["surfaces:", "  x:", "    knowledge: [KB-ASMT-SCHEDULE]", "    feature: beta"],
      "/intentset/slice/surfaces/x/feature",
    ],
    [["surfaces:", "  x:", "    knowledge: []"], "/intentset/slice/surfaces/x/knowledge"],
    [
      ["surfaces:", "  x:", "    knowledge: [KB-ASMT-SCHEDULE, KB-ASMT-SCHEDULE]"],
      "/intentset/slice/surfaces/x/knowledge/1",
    ],
    [["surfaces:", "  x:", "    knowledge: [kb-schedule]"], "/intentset/slice/surfaces/x/knowledge/0"],
  ];
  for (const [lines, field] of cases) {
    assert.deepEqual(codes(tree(lines)), [`CORE001 SLICE-ASMT-SCHEDULE ${field}`], lines.join(" | "));
  }
});

test("BEH-SURFACES: a slice that declares a surface without availability is CORE001 at availability", () => {
  assert.deepEqual(codes(tree(SCHEDULE, { availability: false })), [
    "CORE001 SLICE-ASMT-SCHEDULE /intentset/availability",
  ]);
});

test("BEH-SURFACES: surfaces beside slice is an unknown key whose remediation says where it goes", () => {
  const result = validate(
    tree([], {
      edit: (name, text) => (name === SLICE ? text.replace("  slice:\n", "  surfaces: {}\n  slice:\n") : text),
    }),
    registries,
  );
  const found = result.diagnostics.find((d) => d.code === "CORE001");
  assert.match(found?.remediation ?? "", /under `slice:`/);
});

test("BEH-SURFACES: a lead that is not in the graph, or is not knowledge, is CORE003", () => {
  assert.deepEqual(codes(tree(["surfaces:", "  x:", "    knowledge: [KB-ASMT-MISSING, BEH-ASMT-SCHEDULE]"])), [
    "CORE003 SLICE-ASMT-SCHEDULE /intentset/slice/surfaces/x/knowledge/0",
    "CORE003 SLICE-ASMT-SCHEDULE /intentset/slice/surfaces/x/knowledge/1",
  ]);
});

const GUIDE: DocumentInput = plainCarrier(
  "KB-ASMT-GUIDE.md",
  [
    "---",
    "markset: 0",
    "intentset:",
    "  spec: '0.4'",
    "  profile: intentset/knowledge/0.4",
    "  id: KB-ASMT-GUIDE",
    "  type: knowledge",
    "  title: Scheduling guide",
    "  status: draft",
    "  owner: team-assessment",
    "  visibility: customer",
    "  audiences: [teacher]",
    "  revision: 1",
    "  links:",
    "    explains: [BEH-ASMT-SCHEDULE]",
    AVAILABILITY,
    "---",
    "",
    "# Scheduling guide",
    "",
    "## Guidance",
    "",
    "Schedule it.",
    "",
  ].join("\n"),
);

test("BEH-SURFACES: retired knowledge leading a surface is CORE005, naming its successor", () => {
  const retire = (name: string, text: string) =>
    name === "KB-ASMT-SCHEDULE.md"
      ? text
          .replace(/ {2}status: \w+\n/, "  status: retired\n")
          .replace("  links:\n", "  links:\n    replacedBy: [KB-ASMT-GUIDE]\n")
      : text;
  const result = validate(tree(SCHEDULE, { edit: retire, extra: [GUIDE] }), registries);
  const found = result.diagnostics.filter((d) => d.code === "CORE005");
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, "error");
  assert.equal(found[0].field, "/intentset/slice/surfaces/lantern-web:~1assessments~1schedule/knowledge/0");
  assert.match(found[0].remediation ?? "", /KB-ASMT-GUIDE/);
});

test("BEH-SURFACES: a surface ID two slices declare is CORE013 on each; a retired one does not count", () => {
  const second = (status: string) =>
    plainCarrier(
      "SLICE-ASMT-HELP.md",
      [
        "---",
        "markset: 0",
        "intentset:",
        "  spec: '0.4'",
        "  profile: intentset/slice/0.4",
        "  id: SLICE-ASMT-HELP",
        "  type: slice",
        "  title: Assessment help wiring",
        `  status: ${status}`,
        "  owner: team-assessment",
        "  visibility: internal",
        "  audiences: [engineering]",
        "  revision: 1",
        AVAILABILITY,
        "  slice:",
        "    kind: technical",
        "    rationale: Shared help wiring.",
        "    domain: assessment",
        "    entrypoints: [src/features/assessment/help/index.ts]",
        "    layers: {}",
        "    claims:",
        "    - kind: source",
        "      path: src/features/assessment/help/**",
        "    usesResources: []",
        "    surfaces:",
        "      lantern-web:/assessments/schedule:",
        "        knowledge: [KB-ASMT-SCHEDULE]",
        "---",
        "",
        "# Assessment help wiring",
        "",
        "## Responsibility",
        "",
        "Help.",
        "",
        "## Public contract",
        "",
        "None.",
        "",
        "## Verification",
        "",
        "None.",
        "",
      ].join("\n"),
    );
  const field = "/intentset/slice/surfaces/lantern-web:~1assessments~1schedule";
  const clashing = codes(tree(SCHEDULE, { extra: [second("draft")] })).filter((line) => line.startsWith("CORE013"));
  assert.deepEqual(clashing, [`CORE013 SLICE-ASMT-HELP ${field}`, `CORE013 SLICE-ASMT-SCHEDULE ${field}`]);
  const retired = codes(tree(SCHEDULE, { extra: [second("retired")] })).filter((line) => line.startsWith("CORE013"));
  assert.deepEqual(retired, []);
});

test("BEH-SURFACES: the YAML reader refuses a __proto__ key at any depth, as CORE010", () => {
  for (const text of ["__proto__: 1\n", "a:\n  __proto__: 1\n", "a:\n  b:\n    __proto__:\n      c: 1\n"]) {
    assert.match(parseYaml(text).error?.message ?? "", /__proto__/, text);
  }
  assert.deepEqual(
    codes(tree(["surfaces:", "  __proto__:", "    knowledge: [KB-ASMT-SCHEDULE]"])).filter((line) =>
      line.startsWith("CORE010"),
    ),
    ["CORE010"],
  );
});

test("BEH-SURFACES: a change to surfaces alone changes the slice's content hash", () => {
  const hashOf = (inputs: DocumentInput[]) =>
    validate(inputs, registries).graph.artifacts.get("SLICE-ASMT-SCHEDULE")?.contentHash;
  assert.notEqual(
    hashOf(tree(SCHEDULE)),
    hashOf(tree(["surfaces:", "  lantern-web:/other:", "    knowledge: [KB-ASMT-SCHEDULE]"])),
  );
});

test("BEH-SURFACES: the export carries surfaces in key order, lists in declared order, less withheld knowledge, an emptied key kept", () => {
  const restricted = plainCarrier(
    "KB-ASMT-SECRET.md",
    GUIDE.source
      .replaceAll("KB-ASMT-GUIDE", "KB-ASMT-SECRET")
      .replace("visibility: customer", "visibility: restricted"),
  );
  const result = validate(
    tree(
      [
        "surfaces:",
        "  lantern-web:/b:",
        "    knowledge: [KB-ASMT-SCHEDULE, KB-ASMT-SECRET]",
        "  /secret:",
        "    knowledge: [KB-ASMT-SECRET]",
      ],
      { extra: [restricted] },
    ),
    registries,
  );
  assert.deepEqual(result.diagnostics, []);
  const meta = {
    repository: "example/scheduling",
    commit: null,
    commitUnavailable: "none",
    generatedAt: "2026-10-02T12:00:00Z",
  };
  const envelope = exportGraph(result, registries, meta);
  const slice = envelope.artifacts.find((a) => a.id === "SLICE-ASMT-SCHEDULE");
  assert.equal(
    JSON.stringify(slice?.slice?.surfaces),
    '{"/secret":{"knowledge":[]},"lantern-web:/b":{"knowledge":["KB-ASMT-SCHEDULE"]}}',
  );
  assert.equal(slice?.withheldLinks, 2);
  assert.equal(readExport(JSON.parse(JSON.stringify(envelope))).ok, true);
  const plainSlice = exportGraph(validate(tree([]), registries), registries, meta).artifacts.find(
    (a) => a.id === "SLICE-ASMT-SCHEDULE",
  );
  assert.deepEqual(plainSlice?.slice?.surfaces, {});
});

test("BEH-SURFACES: readExport refuses a slice without surfaces, or with a key that breaks the rules", () => {
  const meta = {
    repository: "example/scheduling",
    commit: null,
    commitUnavailable: "none",
    generatedAt: "2026-10-02T12:00:00Z",
  };
  const envelope = JSON.parse(JSON.stringify(exportGraph(validate(tree(SCHEDULE), registries), registries, meta)));
  const slice = envelope.artifacts.find((a: { id: string }) => a.id === "SLICE-ASMT-SCHEDULE");
  const missing = structuredClone(envelope);
  delete missing.artifacts.find((a: { id: string }) => a.id === "SLICE-ASMT-SCHEDULE").slice.surfaces;
  assert.equal(readExport(missing).ok, false);
  slice.slice.surfaces = { "404": { knowledge: [] } };
  assert.equal(readExport(envelope).ok, false);
});
