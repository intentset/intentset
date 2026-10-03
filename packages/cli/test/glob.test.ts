import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { matchGlob } from "../src/glob.ts";
import { enumerate } from "../src/repository.ts";

test("a literal pattern matches only its own path", () => {
  assert.equal(matchGlob("product/a.md", "product/a.md"), true);
  assert.equal(matchGlob("product/a.md", "product/b.md"), false);
  assert.equal(matchGlob("product/a.md", "product/a.md/x"), false);
  assert.equal(matchGlob("product", "product/a.md"), false);
});

test("* matches within one segment and never crosses a slash", () => {
  assert.equal(matchGlob("product/*.md", "product/a.md"), true);
  assert.equal(matchGlob("product/*.md", "product/.md"), true);
  assert.equal(matchGlob("product/*.md", "product/x/a.md"), false);
  assert.equal(matchGlob("*", "a"), true);
  assert.equal(matchGlob("*", "a/b"), false);
  assert.equal(matchGlob("BEH-*-SCHEDULE.md", "BEH-ASMT-SCHEDULE.md"), true);
  assert.equal(matchGlob("a**b", "axyzb"), true, "** inside a segment is two stars, not a segment wildcard");
  assert.equal(matchGlob("a**b", "ax/yb"), false);
});

test("** matches zero or more whole segments, anywhere in the pattern", () => {
  assert.equal(matchGlob("product/**/*.md", "product/a.md"), true, "zero segments");
  assert.equal(matchGlob("product/**/*.md", "product/x/a.md"), true);
  assert.equal(matchGlob("product/**/*.md", "product/x/y/z/a.md"), true);
  assert.equal(matchGlob("product/**/*.md", "other/x/a.md"), false);
  assert.equal(matchGlob("**/*.md", "a.md"), true);
  assert.equal(matchGlob("**/*.md", "a/b/c.md"), true);
  assert.equal(matchGlob("**/*.md", "a/b/c.txt"), false);
  assert.equal(matchGlob("node_modules/**", "node_modules"), true, "a trailing ** matches the directory itself");
  assert.equal(matchGlob("node_modules/**", "node_modules/x/y.md"), true);
  assert.equal(matchGlob("node_modules/**", "src/node_modules/y.md"), false);
  assert.equal(matchGlob("a/**/b/**/c.md", "a/b/c.md"), true);
  assert.equal(matchGlob("a/**/b/**/c.md", "a/x/b/y/z/c.md"), true);
  assert.equal(matchGlob("a/**/b/**/c.md", "a/x/y/z/c.md"), false);
});

test("nothing else is special: dots, brackets and question marks are literal", () => {
  assert.equal(matchGlob("a.md", "axmd"), false);
  assert.equal(matchGlob("a?.md", "ab.md"), false);
  assert.equal(matchGlob("a?.md", "a?.md"), true);
  assert.equal(matchGlob("[ab].md", "a.md"), false);
  assert.equal(matchGlob("(x)+.md", "(x)+.md"), true);
});

test("a leading ./ and doubled slashes name the same path", () => {
  assert.equal(matchGlob("./product/*.md", "product/a.md"), true);
  assert.equal(matchGlob("product//*.md", "product/a.md"), true);
});

test("many ** against a deep miss stays fast", () => {
  const pattern = `${Array.from({ length: 12 }, () => "**").join("/")}/z.md`;
  const path = `${Array.from({ length: 40 }, (_, i) => `d${i}`).join("/")}/y.md`;
  const started = performance.now();
  assert.equal(matchGlob(pattern, path), false);
  assert.ok(performance.now() - started < 500);
});

test("enumerate honors scope and ignore, sorts, and does not follow symbolic links", (t) => {
  const root = mkdtempSync(join(tmpdir(), "intentset-glob-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ["b/z.md", "b/a.md", "a.md", "drafts/x.md", "b/c/notes.txt", "outside/o.md"]) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "x");
  }
  symlinkSync(join(root, "outside"), join(root, "b", "linked"), "dir");
  const found = enumerate(root, { scope: ["**/*.md"], ignore: ["drafts/**", "outside/**"] });
  assert.deepEqual(found, ["a.md", "b/a.md", "b/z.md"]);
});
