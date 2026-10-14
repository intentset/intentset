/**
 * What the evidence package's subject hash needs from the architecture (Core §8, ADR 0013): claimed files, resource
 * files, a test's local import closure that stops at a package boundary, global inputs, and the files that can move
 * some subject.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Graph, plainCarrier, type Registries, validate } from "@intentset/core";
import { subjectSource } from "../src/index.ts";

const REGISTRIES: Registries = {
  owners: ["team-a"],
  audiences: ["engineering"],
  releases: [],
  roles: [],
  editions: [],
  flags: [],
  evidenceSources: [],
  resources: [{ id: "RES-DATA", path: "amplify/data/**", owner: "team-a", consumers: ["SLICE-A"] }],
};

const frontmatter = (id: string, type: string, extra: string) => `---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/${type}/0.1
  id: ${id}
  type: ${type}
  title: ${id}
  status: draft
  owner: team-a
  visibility: internal
  audiences:
  - engineering
${extra}---

# ${id}
`;

const SLICE_A = frontmatter(
  "SLICE-A",
  "slice",
  `  slice:
    kind: technical
    rationale: Fixture.
    domain: test
    entrypoints:
    - packages/a/src/index.ts
    layers: {}
    claims:
    - kind: source
      path: packages/a/src/**
    - kind: verification
      path: packages/a/test/**
    usesResources:
    - RES-DATA
`,
);
const TEST_A = frontmatter(
  "TEST-A",
  "verification",
  `  verification:
    method: automated
    locator: packages/a/test/a.test.ts
    selector: a
    exercises:
    - RES-DATA
`,
);

function graphOf(documents: Record<string, string>): Graph {
  return validate(
    Object.entries(documents).map(([path, text]) => plainCarrier(path, text)),
    REGISTRIES,
  ).graph;
}

const FILES = new Map<string, string>([
  ["packages/a/package.json", '{"name":"@w/a"}'],
  ["packages/a/src/index.ts", "export const a = 1;\n"],
  [
    "packages/a/test/a.test.ts",
    'import { helper } from "./helper.ts";\nimport { a } from "../src/index.ts";\nimport { other } from "@w/b";\nimport { fs } from "node:fs";\n',
  ],
  ["packages/a/test/helper.ts", 'import { deeper } from "./deeper.ts";\nexport const helper = deeper;\n'],
  ["packages/a/test/deeper.ts", 'import { cycle } from "./helper.ts";\nexport const deeper = 1;\n'],
  ["packages/b/package.json", '{"name":"@w/b","exports":{".":"./src/index.ts"}}'],
  ["packages/b/src/index.ts", 'import { c } from "./c.ts";\nexport const other = c;\n'],
  ["packages/b/src/c.ts", "export const c = 1;\n"],
  ["amplify/data/resource.ts", "export const data = 1;\n"],
  ["amplify/data/extra/model.ts", "export const model = 1;\n"],
  ["pnpm-lock.yaml", "lock\n"],
  ["tsconfig.base.json", "{}"],
  ["tsconfig.app.json", "{}"],
  ["scripts/unrelated.ts", "export {};\n"],
]);

const source = (overrides: { globalInputs?: string[]; graph?: Graph } = {}) =>
  subjectSource(
    overrides.graph ?? graphOf({ "SLICE-A.md": SLICE_A, "TEST-A.md": TEST_A }),
    REGISTRIES,
    { files: FILES },
    {
      globalInputs: overrides.globalInputs ?? ["pnpm-lock.yaml", "tsconfig.*.json"],
      readFile: (path) => (FILES.has(path) ? Buffer.from(FILES.get(path) as string) : undefined),
    },
  );

describe("BEH-EVIDENCE-CURRENT: subjectSource", () => {
  test("a slice's files are what its claims resolve to, tests included when a verification claim names them", () => {
    assert.deepEqual(source().sliceFiles.get("SLICE-A"), [
      "packages/a/src/index.ts",
      "packages/a/test/a.test.ts",
      "packages/a/test/deeper.ts",
      "packages/a/test/helper.ts",
    ]);
  });

  test("a resource is its registry entry and the files its path matches", () => {
    const data = source().resources.get("RES-DATA");
    assert.deepEqual(data?.files, ["amplify/data/extra/model.ts", "amplify/data/resource.ts"]);
    assert.equal((data?.record as { id: string } | undefined)?.id, "RES-DATA");
  });

  test("a test's local imports are transitive, stop at the package boundary, and leave out the test itself", () => {
    assert.deepEqual(source().localImports("packages/a/test/a.test.ts"), [
      "packages/a/src/index.ts",
      "packages/a/test/deeper.ts",
      "packages/a/test/helper.ts",
    ]);
    assert.deepEqual(source().localImports("packages/b/src/index.ts"), ["packages/b/src/c.ts"]);
    assert.deepEqual(source().localImports("packages/a/src/index.ts"), []);
    assert.deepEqual(source().localImports("no/such/file.ts"), []);
  });

  test("global inputs are paths, kept even when absent, and patterns, expanded over the tree and sorted", () => {
    assert.deepEqual(source().globalInputs, ["pnpm-lock.yaml", "tsconfig.app.json", "tsconfig.base.json"]);
    assert.deepEqual(source({ globalInputs: ["missing.lock", "scripts/*.ts", "missing.lock"] }).globalInputs, [
      "missing.lock",
      "scripts/unrelated.ts",
    ]);
  });

  test("covers: claimed files, used resources' files, global inputs, tests and their imports and records; nothing else", () => {
    const { covers } = source();
    for (const path of [
      "packages/a/src/index.ts",
      "amplify/data/resource.ts",
      "amplify/data/extra/model.ts",
      "pnpm-lock.yaml",
      "tsconfig.base.json",
      "packages/a/test/a.test.ts",
      "TEST-A.md",
      "SLICE-A.md",
    ]) {
      assert.equal(covers(path), true, path);
    }
    for (const path of ["scripts/unrelated.ts", "packages/b/src/c.ts", "README.md"]) {
      assert.equal(covers(path), false, path);
    }
  });

  test("a resource no slice uses and no check exercises is not covered", () => {
    const withoutExercise = TEST_A.replace("    exercises:\n    - RES-DATA\n", "");
    const noUse = SLICE_A.replace("    usesResources:\n    - RES-DATA\n", "    usesResources: []\n");
    const { covers } = source({ graph: graphOf({ "SLICE-A.md": noUse, "TEST-A.md": withoutExercise }) });
    assert.equal(covers("amplify/data/resource.ts"), false);
    assert.equal(covers("packages/a/src/index.ts"), true);
  });

  test("the same inputs give the same source, whatever order the tree was built in", () => {
    const reversed = new Map([...FILES].reverse());
    const a = source();
    const b = subjectSource(
      graphOf({ "TEST-A.md": TEST_A, "SLICE-A.md": SLICE_A }),
      REGISTRIES,
      { files: reversed },
      {
        globalInputs: ["tsconfig.*.json", "pnpm-lock.yaml"],
        readFile: () => undefined,
      },
    );
    assert.deepEqual([...b.sliceFiles], [...a.sliceFiles]);
    assert.deepEqual(b.globalInputs, a.globalInputs);
    assert.deepEqual(b.localImports("packages/a/test/a.test.ts"), a.localImports("packages/a/test/a.test.ts"));
  });
});
