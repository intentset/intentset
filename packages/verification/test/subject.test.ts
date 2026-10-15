import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Artifact, Edge, Graph, LinkKind } from "@intentset/core";
import {
  computeSubject,
  includedSlices,
  movedParts,
  partsChangedAmong,
  SUBJECT_PART_KINDS,
  type SubjectInput,
  verifiedBehaviors,
} from "../src/index.ts";

/** A hand-built graph: ids, types, authored links and a version string standing for each record's source. */
interface Node {
  type: string;
  links?: Partial<Record<LinkKind, string[]>>;
  verification?: { method: "automated"; locator: string; selector: string; exercises?: string[] };
  slice?: { claims?: { kind: string; path: string }[]; usesResources?: string[]; entrypoints?: string[] };
  version?: string;
}

function stubGraph(nodes: Record<string, Node>): Graph {
  const artifacts = new Map<string, Artifact>();
  const edges: Edge[] = [];
  for (const [id, node] of Object.entries(nodes)) {
    artifacts.set(id, {
      meta: { id, type: node.type, links: node.links ?? {}, verification: node.verification, slice: node.slice },
      path: `${id}.md`,
      sourceHash: `src:${id}:${node.version ?? "1"}`,
      body: "",
      headings: [],
      foreign: {},
    } as unknown as Artifact);
    for (const [kind, targets] of Object.entries(node.links ?? {})) {
      for (const to of targets ?? []) edges.push({ kind: kind as LinkKind, from: id, to, derived: false });
    }
  }
  const out = new Map<string, Edge[]>();
  const into = new Map<string, Edge[]>();
  for (const edge of edges) {
    out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
    into.set(edge.to, [...(into.get(edge.to) ?? []), edge]);
  }
  return { artifacts, edges, derived: [], out, in: into };
}

const BASE: Record<string, Node> = {
  "BEH-A": { type: "behavior", links: { governedBy: ["RULE-A"] } },
  "RULE-A": { type: "rule" },
  "SCN-A": { type: "scenario", links: { illustrates: ["BEH-A"] } },
  "SLICE-A": {
    type: "slice",
    links: { implements: ["BEH-A"], dependsOn: ["SLICE-B"] },
    slice: {
      claims: [{ kind: "source", path: "a/**" }],
      usesResources: ["RES-DATA"],
      entrypoints: ["a/one.ts"],
    },
  },
  "SLICE-B": { type: "slice", links: { dependsOn: ["SLICE-C"] } },
  "SLICE-C": { type: "slice" },
  "SLICE-D": { type: "slice" },
  "SLICE-E": { type: "slice", links: { dependsOn: ["SLICE-A"] } },
  "BEH-Z": { type: "behavior" },
  "SLICE-Z": { type: "slice", links: { implements: ["BEH-Z"] } },
  "TEST-A": {
    type: "verification",
    links: { verifies: ["BEH-A"] },
    verification: { method: "automated", locator: "tests/a.test.ts", selector: "a" },
  },
  "TEST-Z": {
    type: "verification",
    links: { verifies: ["BEH-Z"] },
    verification: { method: "automated", locator: "tests/z.test.ts", selector: "z" },
  },
};

const FILES: Record<string, string> = {
  "a/one.ts": "one",
  "a/two.ts": "two",
  "b/b.ts": "b",
  "c/c.ts": "c",
  "d/d.ts": "d",
  "e/e.ts": "e",
  "z/z.ts": "z",
  "data/table.ts": "table",
  "data/other.ts": "other",
  "tests/a.test.ts": "test a",
  "tests/helpers/fixture.ts": "fixture",
  "tests/helpers/deeper.ts": "deeper",
  "tests/z.test.ts": "test z",
  "pnpm-lock.yaml": "lock",
  "tsconfig.json": "tsconfig",
  "README.md": "readme",
};

const SLICE_FILES = {
  "SLICE-A": ["a/one.ts", "a/two.ts"],
  "SLICE-B": ["b/b.ts"],
  "SLICE-C": ["c/c.ts"],
  "SLICE-D": ["d/d.ts"],
  "SLICE-E": ["e/e.ts"],
  "SLICE-Z": ["z/z.ts"],
};

const RESOURCES = new Map([
  ["RES-DATA", { record: { id: "RES-DATA", path: "data/table.ts" }, files: ["data/table.ts"] }],
  ["RES-OTHER", { record: { id: "RES-OTHER", path: "data/other.ts" }, files: ["data/other.ts"] }],
]);

/** What the architecture package resolves for the test: its helper, which imports another, both in its package. */
const IMPORTS: Record<string, string[]> = {
  "tests/a.test.ts": ["tests/helpers/fixture.ts", "tests/helpers/deeper.ts"],
};

function input(
  overrides: Partial<SubjectInput> & { files?: Record<string, string>; nodes?: Record<string, Node> } = {},
): SubjectInput {
  const files = { ...FILES, ...overrides.files };
  return {
    graph: stubGraph({ ...BASE, ...overrides.nodes }),
    verificationId: "TEST-A",
    readFile: (path) => (path in files ? Buffer.from(files[path]) : undefined),
    sliceFiles: SLICE_FILES,
    resources: RESOURCES,
    localImports: (path) => IMPORTS[path] ?? [],
    globalInputs: ["pnpm-lock.yaml", "tsconfig.json"],
    ...overrides,
  };
}

const hashOf = (overrides?: Parameters<typeof input>[0]) => computeSubject(input(overrides)).hash;

describe("BEH-EVIDENCE-CURRENT: the subject hash", () => {
  test("the same inputs give the same hash, in any order of files and inputs", () => {
    const a = computeSubject(input());
    const b = computeSubject(
      input({
        globalInputs: ["tsconfig.json", "pnpm-lock.yaml"],
        sliceFiles: { ...SLICE_FILES, "SLICE-A": ["a/two.ts", "a/one.ts"] },
      }),
    );
    assert.match(a.hash, /^[0-9a-f]{64}$/);
    assert.equal(a.hash, b.hash);
    assert.deepEqual(a.parts, b.parts);
    assert.equal(a.hash, hashOf());
  });

  test("the hash of a fixed input is pinned, so a change to the format is a decision", () => {
    assert.equal(hashOf(), "d7b2dd72267041ba689fbd2ee9f57dd457bf624b3ccdc0709c2989d8b88cf103");
    // `used` is the rule of 0.7.0, and hashes this input as 0.7.0 did.
    assert.equal(hashOf({ resourceMode: "used" }), "6ca38ac8b3f2e2a9aa7a485463e71b8e66972e0625985672ebc2f35b2c977a9d");
  });

  test("it includes the implementing slice, its dependsOn closure and no other slice", () => {
    const graph = stubGraph(BASE);
    assert.deepEqual(verifiedBehaviors(graph, "TEST-A"), ["BEH-A"]);
    assert.deepEqual(
      [...includedSlices(graph, "TEST-A")],
      [
        ["SLICE-A", "implements"],
        ["SLICE-B", "dependsOn"],
        ["SLICE-C", "dependsOn"],
      ],
    );
  });

  test("a rule or a scenario verified stands for the behaviors it governs or illustrates", () => {
    const nodes: Record<string, Node> = {
      "TEST-R": {
        type: "verification",
        links: { verifies: ["RULE-A", "SCN-A"] },
        verification: { method: "automated", locator: "tests/a.test.ts", selector: "r" },
      },
    };
    const graph = stubGraph({ ...BASE, ...nodes });
    assert.deepEqual(verifiedBehaviors(graph, "TEST-R"), ["BEH-A"]);
    assert.ok(includedSlices(graph, "TEST-R").has("SLICE-A"));
  });

  test("each part's change changes the hash", () => {
    const base = hashOf();
    const changes: Record<string, Parameters<typeof input>[0]> = {
      "a claimed file of the implementing slice": { files: { "a/one.ts": "one!" } },
      "a claimed file of a direct dependency": { files: { "b/b.ts": "b!" } },
      "a claimed file of a transitive dependency": { files: { "c/c.ts": "c!" } },
      "a file added to a claim": {
        sliceFiles: { ...SLICE_FILES, "SLICE-A": [...SLICE_FILES["SLICE-A"], "a/three.ts"] },
      },
      "a claimed file deleted": {
        files: { "a/two.ts": undefined as unknown as string },
        readFile: (p) => (p === "a/two.ts" ? undefined : Buffer.from(FILES[p] ?? "")),
      },
      "the test file": { files: { "tests/a.test.ts": "test a!" } },
      "a global input": { files: { "pnpm-lock.yaml": "lock!" } },
      "the verified behavior": { nodes: { "BEH-A": { ...BASE["BEH-A"], version: "2" } } },
      "the governing rule": { nodes: { "RULE-A": { type: "rule", version: "2" } } },
      "the verification record": { nodes: { "TEST-A": { ...BASE["TEST-A"], version: "2" } } },
      "a locally imported helper": { files: { "tests/helpers/fixture.ts": "fixture!" } },
      "a file the helper imports, transitively": { files: { "tests/helpers/deeper.ts": "deeper!" } },
      "a binding field of the implementing slice: its claims": {
        nodes: {
          "SLICE-A": {
            ...BASE["SLICE-A"],
            slice: { ...BASE["SLICE-A"].slice, claims: [{ kind: "source", path: "a/one.ts" }] },
          },
        },
      },
      "a binding field of the implementing slice: its entrypoints": {
        nodes: { "SLICE-A": { ...BASE["SLICE-A"], slice: { ...BASE["SLICE-A"].slice, entrypoints: ["a/two.ts"] } } },
      },
      "a binding field of the implementing slice: usesResources": {
        nodes: { "SLICE-A": { ...BASE["SLICE-A"], slice: { ...BASE["SLICE-A"].slice, usesResources: [] } } },
      },
      "a binding field of the implementing slice: dependsOn": {
        nodes: {
          "SLICE-A": { ...BASE["SLICE-A"], links: { implements: ["BEH-A"], dependsOn: ["SLICE-B", "SLICE-D"] } },
        },
      },
      "a global input added": { globalInputs: ["pnpm-lock.yaml", "tsconfig.json", "README.md"] },
    };
    for (const [name, change] of Object.entries(changes)) {
      assert.notEqual(hashOf(change), base, name);
    }
  });

  test("an unrelated record or file does not change the hash", () => {
    const base = hashOf();
    assert.equal(hashOf({ files: { "d/d.ts": "d!" } }), base, "a slice nobody here depends on");
    assert.equal(
      hashOf({ files: { "e/e.ts": "e!" } }),
      base,
      "a slice that depends on this one (the arrow points the other way)",
    );
    assert.equal(
      hashOf({ files: { "z/z.ts": "z!", "tests/z.test.ts": "z!" } }),
      base,
      "another behavior's slice and test",
    );
    assert.equal(hashOf({ files: { "README.md": "readme!" } }), base, "a file no slice claims and no input names");
    assert.equal(hashOf({ nodes: { "SLICE-D": { type: "slice", version: "2" } } }), base, "an unrelated slice record");
    assert.equal(
      hashOf({ nodes: { "SLICE-A": { ...BASE["SLICE-A"], version: "2" } } }),
      base,
      "the implementing slice's prose: only its binding fields are in the subject",
    );
    assert.equal(
      hashOf({ files: { "data/other.ts": "other!" } }),
      base,
      "the file of a resource no included slice uses",
    );
    assert.equal(
      hashOf({ files: { "data/table.ts": "table!" } }),
      base,
      "the file of a resource an included slice lists in usesResources but no check exercises and no implementing slice claims into",
    );
    assert.equal(hashOf({ files: { "tests/helpers/unrelated.ts": "x" } }), base, "a helper the test does not import");
    assert.equal(hashOf({ nodes: { "BEH-Z": { type: "behavior", version: "9" } } }), base, "an unrelated behavior");
    assert.equal(hashOf({ nodes: { "TEST-Z": { ...BASE["TEST-Z"], version: "9" } } }), base, "another verification");
  });

  test("exercises adds the named slice and its closure, and only then does its file count", () => {
    const base = hashOf();
    const exercising: Record<string, Node> = {
      "TEST-A": {
        ...BASE["TEST-A"],
        verification: { ...(BASE["TEST-A"].verification as Node["verification"] & object), exercises: ["SLICE-D"] },
      },
    };
    assert.equal(hashOf({ files: { "d/d.ts": "d!" } }), base);
    const declared = hashOf({ nodes: exercising });
    assert.notEqual(declared, base);
    assert.notEqual(hashOf({ nodes: exercising, files: { "d/d.ts": "d!" } }), declared);
    assert.equal(includedSlices(stubGraph({ ...BASE, ...exercising }), "TEST-A").get("SLICE-D"), "exercises");
  });

  test("exercises may name a resource, whose files then count", () => {
    const exercising: Record<string, Node> = {
      "TEST-A": {
        ...BASE["TEST-A"],
        verification: { ...(BASE["TEST-A"].verification as Node["verification"] & object), exercises: ["RES-OTHER"] },
      },
    };
    const declared = hashOf({ nodes: exercising });
    assert.notEqual(declared, hashOf());
    assert.notEqual(hashOf({ nodes: exercising, files: { "data/other.ts": "other!" } }), declared);
    const subject = computeSubject(input({ nodes: exercising }));
    assert.deepEqual(
      subject.parts.filter((p) => p.kind === "resource").map((p) => [p.id, p.why]),
      [["RES-OTHER", "exercises"]],
    );
    const used = computeSubject(input({ nodes: exercising, resourceMode: "used" }));
    assert.deepEqual(
      used.parts.filter((p) => p.kind === "resource").map((p) => [p.id, p.why]),
      [
        ["RES-DATA", "usesResources"],
        ["RES-OTHER", "exercises"],
      ],
    );
  });

  test("a resource named in exercises counts whether or not a slice lists it, and says so with exercises", () => {
    const exercising: Record<string, Node> = {
      "TEST-A": {
        ...BASE["TEST-A"],
        verification: { ...(BASE["TEST-A"].verification as Node["verification"] & object), exercises: ["RES-DATA"] },
      },
    };
    const declared = computeSubject(input({ nodes: exercising }));
    assert.deepEqual(
      declared.parts.filter((p) => p.kind === "resource").map((p) => [p.id, p.why]),
      [["RES-DATA", "exercises"]],
    );
    assert.notEqual(
      hashOf({ nodes: exercising, files: { "data/table.ts": "table!" } }),
      declared.hash,
      "an exercised resource's file moves the subject",
    );
    assert.deepEqual(declared.unexercised, []);
  });

  test("a resource an included slice only lists is not hashed, and the subject says what it left out", () => {
    const subject = computeSubject(input());
    assert.deepEqual(
      subject.parts.filter((p) => p.kind === "resource" || p.kind === "resource-file"),
      [],
    );
    assert.deepEqual(subject.unexercised, [{ id: "RES-DATA", files: ["data/table.ts"] }]);
    assert.deepEqual(computeSubject(input({ resourceMode: "used" })).unexercised, []);
  });

  test("the slice's usesResources is a binding field, so listing or unlisting a resource still moves the subject", () => {
    const unlisted = { "SLICE-A": { ...BASE["SLICE-A"], slice: { ...BASE["SLICE-A"].slice, usesResources: [] } } };
    assert.notEqual(hashOf({ nodes: unlisted }), hashOf());
    assert.deepEqual(computeSubject(input({ nodes: unlisted })).unexercised, []);
  });

  test("a resource the implementing slice lists and claims a file of is its own, and its files count as its claims do", () => {
    const own = { ...SLICE_FILES, "SLICE-A": ["a/one.ts", "a/two.ts", "data/table.ts"] };
    const subject = computeSubject(input({ sliceFiles: own }));
    assert.deepEqual(
      subject.parts.filter((p) => p.kind === "resource").map((p) => [p.id, p.why]),
      [["RES-DATA", "usesResources"]],
    );
    assert.deepEqual(subject.unexercised, []);
    const widened = new Map([
      ["RES-DATA", { record: { id: "RES-DATA", path: "data/**" }, files: ["data/table.ts", "data/other.ts"] }],
    ]);
    const before = hashOf({ sliceFiles: own, resources: widened });
    assert.notEqual(
      hashOf({ sliceFiles: own, resources: widened, files: { "data/other.ts": "other!" } }),
      before,
      "a file of the resource the slice does not claim still moves the subject: the whole resource is its own",
    );
  });

  test("a resource a dependency slice owns does not count: only an implementing slice's own resource does", () => {
    const nodes = {
      "SLICE-B": {
        type: "slice",
        links: { dependsOn: ["SLICE-C"] },
        slice: { usesResources: ["RES-OTHER"] },
      },
    };
    const sliceFiles = { ...SLICE_FILES, "SLICE-B": ["b/b.ts", "data/other.ts"] };
    const subject = computeSubject(input({ nodes, sliceFiles }));
    assert.deepEqual(
      subject.parts.filter((p) => p.kind === "resource"),
      [],
    );
    assert.deepEqual(subject.unexercised, [
      { id: "RES-DATA", files: ["data/table.ts"] },
      { id: "RES-OTHER", files: ["data/other.ts"] },
    ]);
  });

  test("used mode hashes the files of every resource an included slice lists", () => {
    const base = hashOf({ resourceMode: "used" });
    assert.notEqual(hashOf({ resourceMode: "used", files: { "data/table.ts": "table!" } }), base);
    assert.notEqual(
      hashOf({
        resourceMode: "used",
        resources: new Map([
          ...RESOURCES,
          ["RES-DATA", { record: { id: "RES-DATA", path: "data/**" }, files: ["data/table.ts"] }],
        ]),
      }),
      base,
      "the registry entry",
    );
    assert.notEqual(
      hashOf({
        resourceMode: "used",
        resources: new Map([
          ...RESOURCES,
          ["RES-DATA", { ...(RESOURCES.get("RES-DATA") as object), files: ["data/table.ts", "data/new.ts"] } as never],
        ]),
      }),
      base,
      "a file added to the resource",
    );
    assert.equal(hashOf({ resourceMode: "used", files: { "data/other.ts": "other!" } }), base, "an unlisted resource");
    assert.notEqual(base, hashOf());
  });

  test("a slice's binding fields are hashed in any order, and its prose not at all", () => {
    const shuffled: Node = {
      ...BASE["SLICE-A"],
      slice: {
        claims: [{ kind: "source", path: "a/**" }],
        usesResources: ["RES-DATA"],
        entrypoints: ["a/one.ts"],
      },
      links: { dependsOn: ["SLICE-B"], implements: ["BEH-A"] },
    };
    assert.equal(hashOf({ nodes: { "SLICE-A": shuffled } }), hashOf());
  });

  test("the test's imports are parts of their own, and the test itself is not one of them", () => {
    const subject = computeSubject(
      input({
        localImports: (path) => (path === "tests/a.test.ts" ? ["tests/a.test.ts", "tests/helpers/fixture.ts"] : []),
      }),
    );
    assert.deepEqual(
      subject.parts.filter((p) => p.kind === "test-import").map((p) => p.id),
      ["tests/helpers/fixture.ts"],
    );
    assert.deepEqual(
      subject.parts.filter((p) => p.kind === "test").map((p) => p.id),
      ["tests/a.test.ts"],
    );
  });

  test("a missing file is told apart from an empty one", () => {
    assert.notEqual(
      hashOf({ files: { "tests/a.test.ts": "" } }),
      hashOf({ readFile: (p) => (p === "tests/a.test.ts" ? undefined : Buffer.from(FILES[p] ?? "")) }),
    );
  });

  test("movedParts names which part moved", () => {
    const before = computeSubject(input());
    const after = computeSubject(input({ files: { "b/b.ts": "b!", "pnpm-lock.yaml": "lock!" } }));
    assert.deepEqual(movedParts(before, after), ["global-input pnpm-lock.yaml", "slice-file b/b.ts (SLICE-B)"]);
    assert.deepEqual(movedParts(before, before), []);
    const kinds = new Set(computeSubject(input({ resourceMode: "used" })).parts.map((p) => p.kind));
    for (const kind of SUBJECT_PART_KINDS) assert.ok(kinds.has(kind), kind);
  });

  test("partsChangedAmong names the parts whose file or record a diff lists, and none for an unrelated file", () => {
    const subject = computeSubject(input());
    assert.deepEqual(
      partsChangedAmong(subject, new Set(["b/b.ts", "tests/helpers/fixture.ts", "BEH-A.md", "unrelated.txt"])),
      ["slice-file b/b.ts (SLICE-B)", "test-import tests/helpers/fixture.ts", "verified BEH-A"],
    );
    assert.deepEqual(partsChangedAmong(subject, new Set(["unrelated.txt"])), []);
  });

  test("a record that is not a verification is refused", () => {
    assert.throws(() => computeSubject(input({ verificationId: "BEH-A" })), /not a verification/);
  });
});
