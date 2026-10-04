import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

/** The Markset version every package that renders or parses is pinned to (CLAUDE.md). */
const MARKSET_VERSION = "0.3.4";

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  homepage?: string;
  license?: string;
  files?: string[];
  exports?: Record<string, string | Record<string, string>>;
  publishConfig?: { access?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

async function manifest(path: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(root, path), "utf8")) as Manifest;
}

/** Workspace package directories, sorted. Directories only: a .DS_Store is not a package. */
async function packageDirs(): Promise<string[]> {
  const entries = await readdir(join(root, "packages"), { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function allManifests(): Promise<[string, Manifest][]> {
  const paths = [...(await packageDirs()).map((d) => `packages/${d}/package.json`), "site/package.json"];
  return Promise.all(paths.map(async (p) => [p, await manifest(p)] as [string, Manifest]));
}

/**
 * Comments are why this file exists. A `//` comment inside a `biome.json`
 * does not fail: Biome drops the members that follow it in that object,
 * silently, so the configuration reads as applied and is not. The file is
 * `.jsonc`, where comments are supported, and this asserts every setting
 * survived parsing rather than trusting that it did.
 */
test("the biome configuration parses with its comments and keeps every setting", async () => {
  const text = await readFile(join(root, "biome.jsonc"), "utf8");
  assert.match(text, /^\s*\/\//m, "the config carries comments, which is the thing that used to break it");
  const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));

  assert.deepEqual(config.formatter, { enabled: true, indentStyle: "space", indentWidth: 2, lineWidth: 120 });
  assert.deepEqual(config.javascript.formatter, { quoteStyle: "double", semicolons: "always", trailingCommas: "all" });
  assert.deepEqual(config.json.formatter, { indentStyle: "space", indentWidth: 2 });
  assert.equal(config.linter.enabled, true);
  assert.equal(config.linter.rules.preset, "recommended");
  assert.equal(config.linter.rules.style.noNonNullAssertion, "off");
  assert.equal(config.assist.actions.source.organizeImports, "off");

  for (const pattern of ["**", "!**/node_modules", "!**/dist", "!docs/requirements/wireframes", "!tests/*.json"]) {
    assert.ok(config.files.includes.includes(pattern), `files.includes lost ${pattern}`);
  }

  const css = config.overrides.find((o: { includes: string[] }) => o.includes.includes("**/*.css"));
  assert.ok(css, "stylesheets are exempt from the formatter");
  assert.equal(css.formatter.enabled, false);
  assert.equal(css.linter.rules.style.noDescendingSpecificity, "off");
});

test("every workspace manifest carries the root version, and every published one the root homepage", async () => {
  const rootPkg = await manifest("package.json");
  assert.match(rootPkg.version, /^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/, rootPkg.version);
  assert.ok(rootPkg.homepage, "the root names the site");

  for (const [path, pkg] of await allManifests()) {
    assert.equal(pkg.version, rootPkg.version, `${path} is on ${pkg.version}`);
    // The homepage is the link npmjs.com shows on the package page, so a stale
    // copy sends every reader arriving through the registry to the wrong site. A private
    // package has no npm page; if it carries one anyway it must still agree.
    if (!pkg.private) assert.equal(pkg.homepage, rootPkg.homepage, `${path} homepage must match the root`);
    else if (pkg.homepage !== undefined) assert.equal(pkg.homepage, rootPkg.homepage, `${path} homepage disagrees`);
  }
});

test("every published package resolves to source in this repository, and to dist everywhere else", async () => {
  const rootPkg = await manifest("package.json");
  let published = 0;
  for (const [path, pkg] of await allManifests()) {
    if (pkg.private) continue;
    published++;
    assert.equal(pkg.license, "MIT", `${path} needs a license or nobody may legally use it`);
    assert.equal(pkg.publishConfig?.access, "public", `${path} would publish restricted`);
    assert.ok(pkg.files?.includes("dist"), `${path} must ship dist`);
    assert.ok(pkg.files?.includes("src"), `${path} ships src too, so declaration maps lead somewhere`);
    const entry = pkg.exports?.["."];
    assert.ok(entry && typeof entry === "object", `${path} has a conditional "." export`);
    // Order is the whole mechanism: first match wins, so the source condition
    // has to come before the two that a published consumer will hit.
    assert.equal(Object.keys(entry)[0], "intentset-source", `${path} lists the source condition first`);
    assert.match(entry["intentset-source"], /^\.\/src\/.*\.ts$/u, `${path} resolves to source in this repo`);
    assert.match(entry.types, /^\.\/dist\/.*\.d\.ts$/u, `${path} types come from dist`);
    assert.match(entry.default, /^\.\/dist\/.*\.js$/u, `${path} installs as compiled JS`);
    for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
      if (dep.startsWith("@intentset/")) assert.equal(range, `^${rootPkg.version}`, `${path} asks for ${dep}@${range}`);
    }
  }
  assert.ok(published >= 8, `expected the published packages, found ${published}`);

  const harness = await manifest("packages/conformance/package.json");
  assert.equal(harness.private, true, "the harness stays private, because nothing consumes it");
  const site = await manifest("site/package.json");
  assert.equal(site.private, true, "the site is not a package");
});

test("the development workflow asks for source, in every script that runs node, and tsc by its own spelling", async () => {
  const rootPkg = await manifest("package.json");
  for (const [name, script] of Object.entries(rootPkg.scripts ?? {})) {
    for (const command of script.split("&&").map((s) => s.trim())) {
      if (!command.startsWith("node ")) continue;
      assert.match(
        command,
        /--conditions=intentset-source/u,
        `script "${name}" runs node without the source condition`,
      );
    }
  }
  const ts = JSON.parse(await readFile(join(root, "tsconfig.json"), "utf8")) as {
    compilerOptions: { customConditions?: string[] };
  };
  assert.deepEqual(ts.compilerOptions.customConditions, ["intentset-source"]);
});

test("the build compiles each package after everything it depends on", async () => {
  // The build config has no source condition, so a package's import of a
  // sibling resolves to that sibling's dist/index.d.ts, which exists only if
  // the sibling was compiled first. The order in the build script is therefore
  // a topological order of the workspace graph, or the build breaks on a
  // clean checkout.
  const rootPkg = await manifest("package.json");
  const build = rootPkg.scripts?.build ?? "";
  const order = [...build.matchAll(/tsc -p packages\/([a-z-]+)\/tsconfig\.build\.json/gu)].map((m) => m[1]);
  assert.ok(order.length > 0, "the build script compiles packages with tsc");
  assert.equal(new Set(order).size, order.length, "no package is compiled twice");

  const dirs = await packageDirs();
  for (const dir of dirs) {
    const pkg = await manifest(`packages/${dir}/package.json`);
    const hasBuild = await readFile(join(root, "packages", dir, "tsconfig.build.json"), "utf8").then(
      () => true,
      () => false,
    );
    if (pkg.private) {
      assert.ok(!order.includes(dir), `${dir} is private and has no place in the publish build`);
      continue;
    }
    assert.ok(hasBuild, `packages/${dir} is published and needs a tsconfig.build.json`);
    assert.ok(order.includes(dir), `the build script does not compile packages/${dir}`);
  }

  for (const [i, dir] of order.entries()) {
    const pkg = await manifest(`packages/${dir}/package.json`);
    const deps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
    for (const dep of Object.keys(deps)) {
      if (!dep.startsWith("@intentset/")) continue;
      const j = order.indexOf(dep.slice("@intentset/".length));
      assert.ok(
        j !== -1 && j < i,
        `${dir} depends on ${dep}, which must be compiled before it (build order: ${order.join(", ")})`,
      );
    }
  }
  assert.match(build, /conformance-suite\/stage\.ts/u, "the build stages the published suite");
});

test(`every Markset dependency is pinned to exactly ${MARKSET_VERSION}`, async () => {
  // A caret here would let two packages parse the same document with two
  // parsers. The adapter's MARKSET_VERSION constant names the same string.
  let seen = 0;
  for (const [path, pkg] of [...(await allManifests()), ["package.json", await manifest("package.json")] as const]) {
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
      for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
        if (!dep.startsWith("@markset-lang/")) continue;
        seen++;
        assert.equal(range, MARKSET_VERSION, `${path} ${field} asks for ${dep}@${range}`);
      }
    }
  }
  assert.ok(seen > 0, "something depends on Markset");
});

test("the suite package depends on nothing, and ships its data", async () => {
  // It is what another implementation is checked against, so it must not
  // carry one, including ours. And the JSON is the artifact: a consumer in a
  // language with no JavaScript in sight reads the files straight off disk.
  const pkg = await manifest("packages/conformance-suite/package.json");
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.peerDependencies ?? {}, {});
  for (const dir of ["cases", "schemas", "examples", "dist", "src"]) {
    assert.ok(pkg.files?.includes(dir), `the suite ships ${dir}`);
  }
  const ignore = await readFile(join(root, ".gitignore"), "utf8");
  for (const dir of ["cases", "schemas", "examples"]) {
    assert.match(ignore, new RegExp(`^packages/conformance-suite/${dir}/$`, "mu"), `${dir} is staged, never committed`);
  }
});

test("the release publishes every published package once, each after everything it depends on", async () => {
  // release.yml publishes in this order and stops at the first failure, so a
  // package goes out only after every sibling it points at already exists.
  const rootPkg = await manifest("package.json");
  const order = [...(rootPkg.scripts?.release ?? "").matchAll(/--filter @intentset\/([a-z-]+)/gu)].map((m) => m[1]);
  assert.equal(new Set(order).size, order.length, "no package is published twice");
  for (const dir of await packageDirs()) {
    const pkg = await manifest(`packages/${dir}/package.json`);
    assert.equal(order.includes(dir), !pkg.private, `${dir} is ${pkg.private ? "private" : "published"}`);
  }
  for (const [i, dir] of order.entries()) {
    const pkg = await manifest(`packages/${dir}/package.json`);
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
      if (!dep.startsWith("@intentset/")) continue;
      const j = order.indexOf(dep.slice("@intentset/".length));
      assert.ok(j !== -1 && j < i, `${dir} depends on ${dep}, which must be published first`);
    }
  }
});
