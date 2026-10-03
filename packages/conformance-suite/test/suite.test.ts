import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { validateSchema } from "@intentset/conformance";
import type { ParseYaml } from "@intentset/conformance/fixtures";
import { loadSection, loadSuite, sections } from "@intentset/conformance-suite";
import * as core from "@intentset/core";
import { EXAMPLES, SCHEMAS, stage } from "../stage.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");

/**
 * Core's strict reader, once it lands. Until then a case that patches
 * frontmatter cannot be staged, which is the right coupling; a case built
 * from whole files can.
 */
const parseYaml: ParseYaml =
  (core as unknown as { parseYaml?: ParseYaml }).parseYaml ??
  (() => {
    throw new Error("core's parseYaml has not landed; a patch cannot be applied yet");
  });

async function withStaged<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "intentset-suite-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("staging expands every case into whole files that still satisfy the schema", async () => {
  await withStaged(async (dir) => {
    const staged = stage({ into: dir, parseYaml });
    const canonical = (await readdir(join(root, "tests"))).filter((n) => n.endsWith(".json")).sort();
    assert.deepEqual(
      staged.sections.map((s) => `${s}.json`),
      canonical,
      "every section is staged, and nothing else",
    );
    assert.deepEqual(sections(join(dir, "cases")), staged.sections);

    const schema = JSON.parse(await readFile(join(root, "spec", "conformance.schema.json"), "utf8"));
    let count = 0;
    for (const section of staged.sections) {
      const cases = loadSection(section, join(dir, "cases"));
      const text = await readFile(join(dir, "cases", `${section}.json`), "utf8");
      assert.deepEqual(validateSchema(schema, JSON.parse(text)), [], `${section}: staged cases satisfy the schema`);
      assert.equal(text, `${JSON.stringify(cases, null, 2)}\n`, `${section}: written as formatted JSON`);
      for (const c of cases) {
        count++;
        assert.equal(c.section, section);
        for (const consumed of ["baseline", "patch", "registries", "config"]) {
          assert.ok(!(consumed in c), `${section} "${c.name}" still carries ${consumed}`);
        }
        assert.ok(c.level, `${section} "${c.name}" names its level explicitly`);
        assert.equal(typeof c.files, "object");
        for (const [path, content] of Object.entries(c.files)) {
          assert.equal(typeof content, "string", `${section} "${c.name}" ${path}: a staged file is never null`);
        }
      }
    }
    assert.equal(count, staged.cases);
    assert.deepEqual(
      loadSuite(join(dir, "cases")),
      Object.fromEntries(staged.sections.map((s) => [s, loadSection(s, join(dir, "cases"))])),
    );

    // Staging is deterministic: the same inputs give the same bytes.
    const again = await mkdtemp(join(tmpdir(), "intentset-suite-again-"));
    try {
      stage({ into: again, parseYaml });
      for (const section of staged.sections) {
        assert.equal(
          await readFile(join(again, "cases", `${section}.json`), "utf8"),
          await readFile(join(dir, "cases", `${section}.json`), "utf8"),
        );
      }
    } finally {
      await rm(again, { recursive: true, force: true });
    }
  });
});

test("staging copies the schemas and the example verbatim", async () => {
  await withStaged(async (dir) => {
    const staged = stage({ into: dir, parseYaml });
    for (const name of SCHEMAS) {
      const source = await readFile(join(root, "spec", `${name}.schema.json`), "utf8").catch(() => null);
      if (source === null) {
        assert.ok(!staged.schemas.includes(name), `${name}.schema.json is not written yet, so it is not staged`);
        continue;
      }
      assert.ok(staged.schemas.includes(name), `${name}.schema.json is staged`);
      assert.equal(await readFile(join(dir, "schemas", `${name}.schema.json`), "utf8"), source);
    }
    assert.ok(staged.schemas.includes("conformance") && staged.schemas.includes("frontmatter"));

    for (const name of EXAMPLES) {
      const files = (await readdir(join(root, "examples", name))).sort();
      assert.deepEqual((await readdir(join(dir, "examples", name))).sort(), files);
      for (const file of files) {
        assert.equal(
          await readFile(join(dir, "examples", name, file), "utf8"),
          await readFile(join(root, "examples", name, file), "utf8"),
        );
      }
    }
  });
});

test("the copy that would actually be packed matches too", async () => {
  // Staging into a temporary directory proves the function; it is the working
  // copy that npm packs, and that copy is gitignored, so no diff would show it
  // drifting. Compare it when it exists.
  const packageDir = resolve(import.meta.dirname, "..");
  const staged = await readdir(join(packageDir, "cases")).catch(() => null);
  if (staged === null) return; // not staged yet in a fresh clone; the build makes it
  await withStaged(async (dir) => {
    stage({ into: dir, parseYaml });
    for (const name of staged.filter((n) => n.endsWith(".json"))) {
      assert.equal(
        await readFile(join(packageDir, "cases", name), "utf8"),
        await readFile(join(dir, "cases", name), "utf8"),
        `packages/conformance-suite/cases/${name} has drifted from tests/`,
      );
    }
  });
});

test("the package ships the data, reachable by path, and depends on nothing", async () => {
  const pkg = JSON.parse(await readFile(join(resolve(import.meta.dirname, ".."), "package.json"), "utf8")) as {
    files: string[];
    exports: Record<string, unknown>;
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  for (const dir of ["cases", "schemas", "examples", "dist", "src"]) assert.ok(pkg.files.includes(dir), `ships ${dir}`);
  assert.ok(pkg.exports["./cases/*.json"], "cases are reachable by path, without the loader");
  assert.ok(pkg.exports["./schemas/*.json"], "and so are the schemas");
  assert.deepEqual(pkg.dependencies ?? {}, {}, "the suite depends on no implementation, including ours");
  assert.match(pkg.scripts?.prepack ?? "", /stage\.ts/, "packing stages first, so the tarball is never stale");
});
