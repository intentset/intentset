import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import * as core from "@intentset/core";
import {
  applyPatch,
  expandCase,
  type ParseYaml,
  serializeYaml,
  setDotted,
  splitDocument,
  treeOf,
} from "../src/fixtures.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const examplesDir = join(root, "examples");

/**
 * Core's strict reader, once it lands. The tests that need it skip with a
 * reason until then rather than fail at link time, so the expansion that does
 * not need a reader stays tested in the meantime. Replace with a named import
 * when core exports it.
 */
const parseYaml = (core as unknown as { parseYaml?: ParseYaml }).parseYaml;

/** A reader that is never reached: the case under test has no patch. */
const noYaml: ParseYaml = () => {
  throw new Error("this case should not need a YAML reader");
};

const DOC_A = "---\nmarkset: 0\nintentset:\n  id: A-ONE\n---\n\n# A\n";
const DOC_B = "---\nmarkset: 0\nintentset:\n  id: B-ONE\n---\n\n# B\n";

async function withBaseline<T>(run: (examples: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "intentset-fixtures-"));
  try {
    const baseline = join(dir, "sample");
    await mkdir(join(baseline, ".intentset"), { recursive: true });
    await writeFile(join(baseline, "A.md"), DOC_A);
    await writeFile(join(baseline, "B.md"), DOC_B);
    await writeFile(join(baseline, "registries.yaml"), "owners:\n- team\n");
    await writeFile(join(baseline, ".intentset", "config.yaml"), "repository: example/sample\n");
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a baseline expands to its documents, with registries and config set apart", async () => {
  await withBaseline(async (examples) => {
    const expanded = expandCase(
      { section: "s", name: "n", baseline: "sample", valid: true },
      { examplesDir: examples, parseYaml: noYaml },
    );
    assert.deepEqual([...expanded.files.keys()], ["A.md", "B.md"]);
    assert.equal(expanded.files.get("A.md"), DOC_A);
    assert.equal(expanded.registriesText, "owners:\n- team\n");
    assert.equal(expanded.configText, "repository: example/sample\n");
    assert.deepEqual([...expanded.sources], []);
    assert.equal(expanded.level, "L1");
    assert.deepEqual(expanded.evidence, []);
    assert.equal(expanded.request, null);
  });
});

test("files add, replace and delete; registries and config mappings replace the baseline's text", async () => {
  await withBaseline(async (examples) => {
    const expanded = expandCase(
      {
        section: "s",
        name: "n",
        baseline: "sample",
        files: { "B.md": null, "C.md": "# C\n", "A.md": "# replaced\n" },
        registries: { owners: ["other"], flags: [] },
        config: { repository: "example/other", scope: ["**/*.md"] },
        sources: { "src/b.ts": "export {};\n", "src/a.ts": "export {};\n", "src/gone.ts": null },
        level: "L3",
        evidence: [{ id: "TEST-ONE", status: "pass" }],
        request: { audience: "teacher", visibility: "customer" },
        valid: true,
      },
      { examplesDir: examples, parseYaml: noYaml },
    );
    assert.deepEqual(
      [...expanded.files],
      [
        ["A.md", "# replaced\n"],
        ["C.md", "# C\n"],
      ],
    );
    assert.equal(expanded.registriesText, "owners:\n- other\nflags: []\n");
    assert.equal(expanded.configText, "repository: example/other\nscope:\n- '**/*.md'\n");
    assert.deepEqual([...expanded.sources.keys()], ["src/a.ts", "src/b.ts"]);
    assert.equal(expanded.level, "L3");
    assert.deepEqual(expanded.evidence, [{ id: "TEST-ONE", status: "pass" }]);
    assert.deepEqual(expanded.request, { audience: "teacher", visibility: "customer" });
  });
});

test("a case without a baseline is built from its files alone, and expansion is idempotent", () => {
  const first = expandCase(
    {
      section: "s",
      name: "n",
      files: { "X.md": "# X\n", "registries.yaml": "owners: []\n", ".intentset/config.yaml": "repository: r\n" },
      valid: true,
    },
    { examplesDir: "/nonexistent", parseYaml: noYaml },
  );
  assert.deepEqual([...first.files.keys()], ["X.md"]);
  assert.equal(first.registriesText, "owners: []\n");
  assert.equal(first.configText, "repository: r\n");

  const tree = treeOf(first);
  assert.deepEqual([...tree.keys()], [".intentset/config.yaml", "X.md", "registries.yaml"]);
  const second = expandCase(
    { section: "s", name: "n", files: Object.fromEntries(tree), valid: true },
    { examplesDir: "/nonexistent", parseYaml: noYaml },
  );
  assert.deepEqual(treeOf(second), tree);
});

test("a patch to a file that is not in the tree is an error, not a silent new file", () => {
  assert.throws(
    () =>
      expandCase(
        { section: "s", name: "n", files: {}, patch: { "Z.md": { body: "x" } }, valid: true },
        { examplesDir: "/nonexistent", parseYaml: noYaml },
      ),
    /patch names Z\.md, which is not in the tree/,
  );
});

test("splitDocument finds the fences and leaves a fenceless document whole", () => {
  assert.deepEqual(splitDocument("---\na: 1\n---\n\nbody\n"), { frontmatter: "a: 1", body: "\nbody\n" });
  assert.deepEqual(splitDocument("# no frontmatter\n"), { frontmatter: null, body: "# no frontmatter\n" });
  assert.deepEqual(splitDocument("---\nunclosed\n"), { frontmatter: null, body: "---\nunclosed\n" });
});

test("setDotted creates intermediate mappings, indexes sequences, and deletes on null", () => {
  const value: Record<string, unknown> = { intentset: { links: { governedBy: ["R-ONE", "R-TWO"] }, audiences: ["a"] } };
  setDotted(value, ["intentset", "links", "governedBy"], ["C-ONE"]);
  setDotted(value, ["intentset", "availability", "flags"], []);
  setDotted(value, ["intentset", "audiences", "1"], "b");
  setDotted(value, ["intentset", "audiences", "0"], null);
  setDotted(value, ["intentset", "links", "missing"], null);
  setDotted(value, ["intentset", "truh"], "yes");
  assert.deepEqual(value, {
    intentset: { links: { governedBy: ["C-ONE"] }, audiences: ["b"], availability: { flags: [] }, truh: "yes" },
  });
  assert.throws(() => setDotted(value, ["intentset", "audiences", "x"], 1), /not an index/);
});

test("the serializer writes the examples' style: bare numbers and booleans, quoted lookalikes, `- ` sequences", () => {
  assert.equal(
    serializeYaml({
      spec: "0.1",
      revision: 1,
      draft: true,
      none: null,
      empty: "",
      list: ["pilot-1", "yes", "2026-01-01", "a: b", "a #b", "-x", "it's"],
      flags: [],
      nothing: {},
      nested: { deep: { key: "value" } },
      claims: [
        { kind: "source", path: "src/**" },
        { kind: "backend", path: "amplify/**" },
      ],
      matrix: [["a", "b"], []],
      "quoted key: yes": 1,
      "has'quote": "x",
      control: "line\nbreak",
    }),
    [
      "spec: '0.1'",
      "revision: 1",
      "draft: true",
      "none: null",
      "empty: ''",
      "list:",
      "- pilot-1",
      "- 'yes'",
      "- '2026-01-01'",
      "- 'a: b'",
      "- 'a #b'",
      "- '-x'",
      "- it's",
      "flags: []",
      "nothing: {}",
      "nested:",
      "  deep:",
      "    key: value",
      "claims:",
      "- kind: source",
      "  path: src/**",
      "- kind: backend",
      "  path: amplify/**",
      "matrix:",
      "- - a",
      "  - b",
      "- []",
      "'quoted key: yes': 1",
      "has'quote: x",
      'control: "line\\nbreak"',
      "",
    ].join("\n"),
  );
  assert.equal(serializeYaml({}), "{}\n");
  assert.throws(() => serializeYaml({ n: Number.POSITIVE_INFINITY }), /no such number/);
});

test("the serializer round-trips every example's frontmatter and registries through core's reader, byte for byte", async (t) => {
  if (!parseYaml) return t.skip("core's parseYaml has not landed yet");
  const dir = join(examplesDir, "scheduling");
  const { readdir } = await import("node:fs/promises");
  const names = (await readdir(dir)).sort();
  assert.ok(names.length > 10, "the example is there");
  for (const name of names) {
    const text = await readFile(join(dir, name), "utf8");
    const yaml = name.endsWith(".yaml") ? text : `${splitDocument(text).frontmatter}\n`;
    const parsed = parseYaml(yaml.endsWith("\n") ? yaml.slice(0, -1) : yaml);
    assert.equal(parsed.error, null, `${name}: ${parsed.error?.message}`);
    assert.equal(serializeYaml(parsed.value as Record<string, unknown>), yaml, `${name} does not round-trip`);
  }
});

test("a dotted-path patch edits one key and leaves every other byte of the document alone", async (t) => {
  if (!parseYaml) return t.skip("core's parseYaml has not landed yet");
  const source = await readFile(join(examplesDir, "scheduling", "BEH-ASMT-SCHEDULE.md"), "utf8");
  const patched = applyPatch(
    source,
    { frontmatter: { "intentset.links.governedBy": ["CAP-ASMT-ASSIGN"], "intentset.revision": null } },
    parseYaml,
  );
  assert.equal(
    patched,
    source
      .replace("    - RULE-ASMT-FUTURE\n    - RULE-ASMT-AUTH\n", "    - CAP-ASMT-ASSIGN\n")
      .replace("  revision: 1\n", ""),
  );
  const body = applyPatch(source, { body: "\n# Other\n" }, parseYaml);
  assert.equal(body, `${source.slice(0, source.indexOf("\n---\n", 4) + 5)}\n# Other\n`);
  const expanded = expandCase(
    {
      section: "core",
      name: "C03",
      baseline: "scheduling",
      patch: { "BEH-ASMT-SCHEDULE.md": { frontmatter: { "intentset.links.governedBy": ["CAP-ASMT-ASSIGN"] } } },
      valid: false,
    },
    { examplesDir, parseYaml },
  );
  assert.equal(expanded.files.size, 13);
  assert.ok(expanded.files.get("BEH-ASMT-SCHEDULE.md")?.includes("    - CAP-ASMT-ASSIGN\n"));
  assert.ok(expanded.registriesText?.startsWith("owners:\n"));
  assert.equal(expanded.configText, null);
});
