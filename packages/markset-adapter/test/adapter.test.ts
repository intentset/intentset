import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { MARKSET_VERSION, marksetCarrier } from "../src/index.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");

test("the pin in package.json is the version the adapter names", async () => {
  const pkg = JSON.parse(await readFile(join(root, "packages", "markset-adapter", "package.json"), "utf8"));
  assert.equal(pkg.dependencies["@markset-lang/parser"], MARKSET_VERSION);
});

test("frontmatter, headings and syntax diagnostics come out in the shared shape", () => {
  const source =
    "---\nmarkset: 0\nintentset:\n  id: X-Y\n---\n\n# Title *em*\n\n```md\n# not a heading\n```\n\n## Public `contract`\n\n> # quoted\n\n:::card\n### inner\n:::\n\n:::nonsense\nx\n:::\n";
  const input = marksetCarrier("a.md", source);
  assert.equal(input.frontmatter?.text, "markset: 0\nintentset:\n  id: X-Y");
  assert.equal(input.frontmatter?.line, 2);
  assert.deepEqual(input.headings, [
    { depth: 1, text: "Title em", line: 7 },
    { depth: 2, text: "Public contract", line: 13 },
    { depth: 3, text: "inner", line: 18 },
  ]);
  assert.ok(input.syntax.length > 0);
  for (const d of input.syntax) {
    assert.equal(d.origin, "syntax");
    assert.equal(d.path, "a.md");
    assert.ok(d.location && d.location.line >= 21, JSON.stringify(d));
  }
});

test("Markset reads a sequence at its key's indentation, and still reports an unsupported version", () => {
  const unindented = "---\nmarkset: 0\nintentset:\n  audiences:\n  - engineering\n---\n\n# T\n";
  assert.deepEqual(marksetCarrier("c.md", unindented).syntax, []);
  const badVersion = "---\nmarkset: 7\n---\n\n# T\n";
  assert.deepEqual(
    marksetCarrier("d.md", badVersion).syntax.map((d) => d.code),
    ["DOCUMENT_VERSION_UNSUPPORTED"],
  );
});

test("a document without frontmatter has null frontmatter and no syntax diagnostics", () => {
  const input = marksetCarrier("b.md", "# Just a heading\n\ntext\n");
  assert.equal(input.frontmatter, null);
  assert.deepEqual(input.syntax, []);
  assert.deepEqual(input.headings, [{ depth: 1, text: "Just a heading", line: 1 }]);
});

test("marksetCarrier and plainCarrier agree on every example document", async () => {
  // plainCarrier is core's fallback (ADR 0003). Loaded dynamically so this file
  // still runs while core is being built; the assertion is what matters.
  const core = (await import("@intentset/core")) as { plainCarrier?: (p: string, s: string) => unknown };
  if (typeof core.plainCarrier !== "function") {
    assert.fail("core.plainCarrier is missing");
  }
  const dir = join(root, "examples", "scheduling");
  const names = (await readdir(dir)).filter((n) => n.endsWith(".md")).sort();
  assert.ok(names.length >= 13);
  for (const name of names) {
    const source = await readFile(join(dir, name), "utf8");
    const path = `examples/scheduling/${name}`;
    const a = marksetCarrier(path, source);
    const b = core.plainCarrier(path, source);
    assert.deepEqual(a, b, name);
  }
});
