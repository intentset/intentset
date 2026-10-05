import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

/** The Markset version every package that renders or parses is pinned to (CLAUDE.md). */
const MARKSET_VERSION = "0.4.1";

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  homepage?: string;
  keywords?: string[];
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

test("the tests, the suite and the installed packages also run under micromark's development build", async () => {
  // Vite, Vitest and Next resolve micromark's development build, which asserts
  // its tokenizer contract where the production build does not. Markset 0.3.3
  // passed every production run and threw on any link under it, and the
  // adapter, publisher and Atlas all parse Markset.
  const scripts = (await manifest("package.json")).scripts ?? {};
  assert.match(scripts.test, /&& pnpm run test:development$/u, "pnpm test ends with the development pass");
  for (const name of ["test:development", "conformance:development"]) {
    assert.match(scripts[name] ?? "", /--conditions=development/u, `${name} asks for the development build`);
    assert.equal(
      scripts[name].replace(" --conditions=development", ""),
      scripts[name.replace(":development", "")].split(" && ")[0].replace(/ site\/test\/\S+| test\/\*\.test\.ts/gu, ""),
      `${name} runs what ${name.replace(":development", "")} runs`,
    );
  }
  for (const workflow of ["ci.yml", "release.yml"]) {
    const text = await readFile(join(root, ".github", "workflows", workflow), "utf8");
    assert.match(text, /- run: pnpm test\n/u, `${workflow} runs pnpm test`);
    assert.match(text, /- run: pnpm run conformance:development\n/u, `${workflow} runs the suite under development`);
  }
  const smoke = await readFile(join(root, "test", "consumer", "smoke.ts"), "utf8");
  assert.match(smoke, /run\("node", \["--conditions=development", "consumer\.mjs"\]\)/u);
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

test("the changelog has an entry for the version in package.json, and every entry says what moved", async () => {
  // Consumers pin export 0.3 and @intentset/core, and before 2026-10-05 nothing
  // told them what changed per version: the release history was the status list
  // in CLAUDE.md, and ADR 0012 made a valid repository invalid inside Core 0.1
  // without a word anywhere a consumer reads.
  const { version } = await manifest("package.json");
  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  assert.match(
    changelog,
    new RegExp(`^## ${version.replace(/\./g, "\\.")} — \\d{4}-\\d{2}-\\d{2}$`, "mu"),
    `the changelog has no entry for ${version}`,
  );
  const entries = changelog.split(/^## /mu).slice(1);
  assert.ok(entries.length >= 6, "the changelog goes back to 0.2.0");
  for (const entry of entries) {
    const [heading, ...rest] = entry.split("\n");
    assert.match(heading, /^(Unreleased|\d+\.\d+\.\d+ — \d{4}-\d{2}-\d{2})$/u, `"${heading}" is not a release heading`);
    const lead = rest
      .join("\n")
      .trim()
      .split(/\n\s*\n/u)[0]
      .replace(/\s+/gu, " ");
    // One bold sentence on what changed, then what moved: the specifications,
    // the suite and the export are what another tool pins.
    assert.match(lead, /^\*\*[^*]+[.!?]\*\* /u, `${heading}: the entry opens with one bold sentence`);
    assert.match(lead, /\b(specifications?|Core|VSA|profile)\b/u, `${heading}: say whether the specifications moved`);
    assert.match(lead, /\b(suite|case|cases)\b/u, `${heading}: say whether the suite moved`);
    assert.match(lead, /\bexport\b/u, `${heading}: say whether the export moved`);
  }
});

/** The packages that go to npm, by directory. */
async function publishedDirs(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of await packageDirs()) if (!(await manifest(`packages/${dir}/package.json`)).private) out.push(dir);
  return out;
}

test("every published package has a README that names it, and keywords", async () => {
  // npm shows the README as the package page, and nine of the ten shipped 0.6.0
  // with none, so an adopter or an agent resolving a dependency landed on a
  // blank page. Markset made the same mistake at 0.3.0, and this is its test.
  for (const dir of await publishedDirs()) {
    const readme = await readFile(join(root, "packages", dir, "README.md"), "utf8").catch(() => "");
    assert.match(readme, new RegExp(`^# @intentset/${dir}$`, "mu"), `${dir} has no README naming it`);
    assert.ok(readme.includes("https://intentset.org/"), `${dir}'s README does not link to intentset.org`);
    const { keywords } = await manifest(`packages/${dir}/package.json`);
    assert.ok(keywords?.includes("intentset"), `${dir} has no keywords, or not "intentset" among them`);
  }
});

test("the README names every published package, so its count cannot go stale", async () => {
  const readme = await readFile(join(root, "README.md"), "utf8");
  const sentence = /^(\w+) packages are published under the `@intentset` scope: (.*)$/mu.exec(readme);
  assert.ok(sentence, "the README has the sentence that lists the published packages");
  const words: Record<string, number> = { eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const published = await publishedDirs();
  assert.equal(words[sentence[1].toLowerCase()], published.length, `the count says ${sentence[1]}`);
  for (const dir of published) assert.ok(sentence[2].includes(`\`${dir}\``), `the README does not name ${dir}`);
});

test("no README runs a bare `npx intentset` that could fetch someone else's package", async () => {
  // `intentset` unscoped on the registry is not ours. Only @intentset/cli has the
  // `intentset` binary, so `npx intentset` after installing any other package
  // (or none) makes npx fetch and run the unscoped one. Every command a README
  // shows either names the CLI (`npx -p @intentset/cli intentset ...`) or comes
  // after the README installs @intentset/cli; `pnpm dlx` always fetches, so it
  // must name the CLI wherever it appears.
  const readmes = ["README.md", ...(await packageDirs()).map((dir) => `packages/${dir}/README.md`)];
  let seen = 0;
  for (const path of readmes) {
    const raw = await readFile(join(root, path), "utf8").catch(() => "");
    // An MCP client's configuration spells the command as JSON: read it as the command line it runs.
    const text = raw.replace(
      /"command"\s*:\s*"([\w-]+)"\s*,\s*"args"\s*:\s*\[([^\]]*)\]/gu,
      (_, command: string, args: string) =>
        `${command} ${[...args.matchAll(/"([^"]*)"/gu)].map((m) => m[1]).join(" ")}`,
    );
    const install = /\b(?:npm (?:install|i)|pnpm add)\b[^\n`]*@intentset\/cli\b/u.exec(text);
    for (const m of text.matchAll(
      /\b(npx|npm exec|pnpm dlx|yarn dlx)((?:[ \t]+[^\s`]+)*?)[ \t]+intentset(?=[\s`'"]|$)/gmu,
    )) {
      seen++;
      const [command, runner, flags] = m;
      if (/(?:^|\s)(?:-p|--package)(?:\s+|=)@intentset\/cli(?:@\S+)?(?=\s|$)/u.test(flags)) continue;
      const installedFirst =
        runner !== "pnpm dlx" && runner !== "yarn dlx" && install !== null && install.index < m.index;
      assert.ok(installedFirst, `${path} runs \`${command.trim()}\` without naming @intentset/cli`);
    }
  }
  assert.ok(seen > 0, "the READMEs show commands, so the pattern above should find some");
});
