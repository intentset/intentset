import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Artifact, Edge, Graph, LinkKind } from "@intentset/core";
import { computeSubject, includedSlices, movedParts, type SubjectInput, verifiedBehaviors } from "../src/index.ts";

/** A hand-built graph: ids, types, authored links and a version string standing for each record's source. */
interface Node {
  type: string;
  links?: Partial<Record<LinkKind, string[]>>;
  verification?: { method: "automated"; locator: string; selector: string; exercises?: string[] };
  version?: string;
}

function stubGraph(nodes: Record<string, Node>): Graph {
  const artifacts = new Map<string, Artifact>();
  const edges: Edge[] = [];
  for (const [id, node] of Object.entries(nodes)) {
    artifacts.set(id, {
      meta: { id, type: node.type, links: node.links ?? {}, verification: node.verification },
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
  "SLICE-A": { type: "slice", links: { implements: ["BEH-A"], dependsOn: ["SLICE-B"] } },
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
  "tests/a.test.ts": "test a",
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

function input(
  overrides: Partial<SubjectInput> & { files?: Record<string, string>; nodes?: Record<string, Node> } = {},
): SubjectInput {
  const files = { ...FILES, ...overrides.files };
  return {
    graph: stubGraph({ ...BASE, ...overrides.nodes }),
    verificationId: "TEST-A",
    readFile: (path) => (path in files ? Buffer.from(files[path]) : undefined),
    sliceFiles: SLICE_FILES,
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
      "the implementing slice's record": { nodes: { "SLICE-A": { ...BASE["SLICE-A"], version: "2" } } },
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
    const kinds = new Set(before.parts.map((p) => p.kind));
    for (const kind of ["verification", "verified", "slice", "slice-file", "test", "global-input"])
      assert.ok(kinds.has(kind as never), kind);
  });

  test("a record that is not a verification is refused", () => {
    assert.throws(() => computeSubject(input({ verificationId: "BEH-A" })), /not a verification/);
  });
});
