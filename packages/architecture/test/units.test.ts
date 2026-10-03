import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Diagnostic, EMPTY_REGISTRIES, type Graph, plainCarrier, validate } from "@intentset/core";
import {
  applyBaseline,
  applyExceptions,
  checkArchitecture,
  covers,
  expandClaims,
  extractImports,
  fingerprint,
  matchAlias,
  matchPattern,
  parseBaseline,
  plainMessage,
  readArchitectureConfig,
  readExceptionRecord,
  resolveConfig,
  Resolver,
  shortestCycle,
  stripJsonComments,
  stronglyConnected,
  validatePattern,
  writeBaseline,
} from "../src/index.ts";
import { finding } from "../src/finding.ts";

describe("patterns (VSA §3)", () => {
  test("validatePattern names each forbidden form", () => {
    assert.equal(validatePattern("src/features/**"), null);
    assert.equal(validatePattern("src/*.ts"), null);
    assert.equal(validatePattern("src/app/[id]/page.tsx"), null);
    assert.equal(validatePattern(""), "is empty");
    assert.equal(validatePattern("/src/x.ts"), "is absolute");
    assert.equal(validatePattern("src/../x"), "contains `..`");
    assert.equal(validatePattern("./src"), "contains a `.` segment");
    assert.equal(validatePattern("src/{a,b}"), "uses brace expansion");
    assert.equal(validatePattern("!src/x"), "uses negation");
    assert.equal(validatePattern("src\\x"), "uses a backslash; patterns are POSIX paths");
    assert.equal(validatePattern("src//x"), "has an empty segment");
    assert.equal(validatePattern("src/"), "has an empty segment");
    assert.match(validatePattern("src/**.ts") ?? "", /stands alone/);
    assert.match(validatePattern("src/***/x") ?? "", /stands alone/);
  });

  test("matchPattern: literal segments, * within one segment, ** across zero or more", () => {
    assert.ok(matchPattern("src/a.ts", "src/a.ts"));
    assert.ok(!matchPattern("src/a.ts", "src/b.ts"));
    assert.ok(matchPattern("src/*.ts", "src/a.ts"));
    assert.ok(!matchPattern("src/*.ts", "src/x/a.ts"), "* never crosses a slash");
    assert.ok(matchPattern("src/**", "src/a.ts"));
    assert.ok(matchPattern("src/**", "src/x/y/a.ts"));
    assert.ok(matchPattern("src/**/a.ts", "src/a.ts"), "** matches zero segments");
    assert.ok(matchPattern("src/**/a.ts", "src/x/y/a.ts"));
    assert.ok(matchPattern("**/ui/screens/**", "src/f/d/s/ui/screens/S.tsx"));
    assert.ok(!matchPattern("**/ui/screens/**", "src/f/d/s/ui/hooks/h.ts"));
    assert.ok(matchPattern("src/app/[id]/*.tsx", "src/app/[id]/page.tsx"), "brackets are literal");
    assert.ok(!matchPattern("src/app/[id]/*.tsx", "src/app/i/page.tsx"));
    assert.ok(!matchPattern("../x", "x"), "an invalid pattern matches nothing");
  });

  test("expandClaims resolves each claim, sorted, minus the ignore list", () => {
    const files = ["src/b.ts", "src/a.ts", "dist/a.js", "src/x/c.test.ts"];
    const out = expandClaims([{ path: "src/**" }, { path: "docs/**" }, { path: "**/*.js" }], files, [
      "dist/**",
      "**/*.test.ts",
    ]);
    assert.deepEqual(out, [["src/a.ts", "src/b.ts"], [], []]);
  });
});

describe("import extraction (profile TS004)", () => {
  const source = `import type { A } from "./a.js";
import d, { type B, c } from "../b";
import { type T1, type T2 } from "./t";
import * as ns from "ns-pkg";
import "./side";
import X = require("./req");
export * from "./star";
export * as nsx from "./starns";
export { a, b as bb } from "./named";
export type { Q } from "./q";
export { local };
const r = /import "x"/g; const t = \`a\${import("./dyn")}b\${ {a:1}.a }\`;
const z = import(name);
type Y = typeof import("./typed");
// import "./commented"
const s = "import './instring'";
class K { import(x) { return x; } }
const q = 4 / 2 / 1; const cjs = require("./cjs");
`;
  const { imports, problems } = extractImports("x.ts", source);
  const by = (specifier: string) => imports.find((i) => i.specifier === specifier);

  test("every declaration shape is found, and nothing inside strings, comments or regular expressions", () => {
    assert.deepEqual(
      imports.map((i) => i.specifier),
      [
        "./a.js",
        "../b",
        "./t",
        "ns-pkg",
        "./side",
        "./req",
        "./star",
        "./starns",
        "./named",
        "./q",
        "./dyn",
        "./typed",
        "./cjs",
      ],
    );
  });

  test("flags: type-only, dynamic, re-export, wildcard, line", () => {
    assert.equal(by("./a.js")?.typeOnly, true);
    assert.equal(by("../b")?.typeOnly, false, "a default binding makes the import a value import");
    assert.equal(by("./t")?.typeOnly, true, "every named specifier marked type");
    assert.equal(by("./q")?.typeOnly, true);
    assert.equal(by("./q")?.reexport, true);
    assert.equal(by("./star")?.wildcard, true);
    assert.equal(by("./starns")?.wildcard, true);
    assert.equal(by("./named")?.wildcard, false);
    assert.equal(by("./dyn")?.dynamic, true);
    assert.equal(by("./typed")?.typeOnly, true);
    assert.equal(by("./cjs")?.dynamic, true);
    assert.equal(by("./req")?.line, 6);
    assert.equal(by("./dyn")?.line, 12);
  });

  test("a computed dynamic specifier is a problem, a method named import is not", () => {
    assert.deepEqual(problems, [
      { line: 13, message: "a dynamic import has a computed specifier, so its target cannot be known" },
    ]);
  });

  test("import type from and import type, {} bind a default named type", () => {
    assert.equal(extractImports("x.ts", 'import type from "./t";').imports[0].typeOnly, false);
    assert.equal(extractImports("x.ts", 'import type, { a } from "./t";').imports[0].typeOnly, false);
  });

  test("JSX text with an apostrophe costs nothing in a .tsx file", () => {
    const tsx = `import { A } from "./a";\nexport const v = <p>Don't panic</p>;\nexport const w = import("./later");\n`;
    const out = extractImports("x.tsx", tsx);
    assert.deepEqual(
      out.imports.map((i) => i.specifier),
      ["./a", "./later"],
    );
    assert.deepEqual(out.problems, []);
  });

  test("an unterminated template literal is reported", () => {
    const out = extractImports("x.ts", 'import "./a";\nconst t = `never closed\n');
    assert.equal(out.imports.length, 1);
    assert.equal(out.problems.length, 1);
    assert.match(out.problems[0].message, /template literal/);
  });
});

describe("resolution (profile TS002, TS004–TS006)", () => {
  const files = new Map<string, string>([
    [
      "tsconfig.json",
      '{\n  // comment\n  "compilerOptions": { "baseUrl": ".", "paths": { "@x/*": ["./src/x/*"], "@x/special/*": ["./src/special/*"], "@one": ["./src/one.ts"] }, },\n}\n',
    ],
    ["src/a.ts", ""],
    ["src/b.ts", ""],
    ["src/c.tsx", ""],
    ["src/dir/index.ts", ""],
    ["src/x/y.ts", ""],
    ["src/special/z.ts", ""],
    ["src/one.ts", ""],
    ["src/lib/util.ts", ""],
    ["apps/web/tsconfig.json", '{ "extends": "./base.json", "compilerOptions": { "jsx": "react-jsx" } }'],
    ["apps/web/base.json", '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }'],
    ["apps/web/src/main.ts", ""],
    ["apps/web/src/routes.ts", ""],
    [
      "packages/core/package.json",
      JSON.stringify({
        name: "@w/core",
        exports: { ".": { types: "./src/index.ts", default: "./dist/index.js" }, "./sub/*": "./src/sub/*.ts" },
      }),
    ],
    ["packages/core/src/index.ts", ""],
    ["packages/core/src/sub/thing.ts", ""],
    ["packages/legacy/package.json", JSON.stringify({ name: "legacy", main: "lib/main.js" })],
    ["packages/legacy/lib/main.ts", ""],
    [
      "packages/cond/package.json",
      JSON.stringify({ name: "cond", exports: { source: "./src/index.ts", default: "./dist/index.js" } }),
    ],
    ["packages/cond/src/index.ts", ""],
  ]);
  const resolver = new Resolver(files, { conditions: [] });
  const to = (from: string, specifier: string) => resolver.resolve(from, specifier);

  test("relative specifiers with extension probes, .js -> .ts and index files", () => {
    assert.equal(to("src/a.ts", "./b").to, "src/b.ts");
    assert.equal(to("src/a.ts", "./b.js").to, "src/b.ts");
    assert.equal(to("src/a.ts", "./c.js").to, "src/c.tsx");
    assert.equal(to("src/a.ts", "./c").to, "src/c.tsx");
    assert.equal(to("src/a.ts", "./dir").to, "src/dir/index.ts");
    assert.equal(to("src/dir/index.ts", ".").to, "src/dir/index.ts");
    assert.equal(to("src/a.ts", "./missing").problem, "names no file in the tree");
    assert.equal(to("src/a.ts", "../../x").problem, "climbs above the repository root");
  });

  test("paths: an exact key wins, then the longest wildcard prefix", () => {
    assert.deepEqual({ ...to("src/a.ts", "@one") }, { to: "src/one.ts", via: "alias", wildcard: false });
    assert.deepEqual({ ...to("src/a.ts", "@x/y") }, { to: "src/x/y.ts", via: "alias", wildcard: true });
    assert.equal(to("src/a.ts", "@x/special/z").to, "src/special/z.ts");
    assert.match(to("src/a.ts", "@x/nothing").problem ?? "", /matches the alias @x\/\* in tsconfig.json/);
    const catchAll = new Resolver(
      new Map([
        ["tsconfig.json", '{ "compilerOptions": { "paths": { "*": ["./types/*"] } } }'],
        ["src/a.ts", ""],
      ]),
      { conditions: [] },
    );
    assert.deepEqual(
      { ...catchAll.resolve("src/a.ts", "react") },
      { to: null, via: "package", wildcard: false },
      "a catch-all key falls back to packages",
    );
  });

  test("baseUrl resolves non-relative paths before packages", () => {
    assert.deepEqual({ ...to("src/a.ts", "src/lib/util") }, { to: "src/lib/util.ts", via: "baseUrl", wildcard: false });
  });

  test("the nearest tsconfig governs, with extends followed in the tree", () => {
    assert.equal(to("apps/web/src/main.ts", "@/routes").to, "apps/web/src/routes.ts");
    assert.equal(to("src/a.ts", "@/routes").problem !== undefined, true, "the root tsconfig has no @/* alias");
  });

  test("workspace packages resolve through exports, subpath patterns, main and conditions", () => {
    assert.deepEqual(
      { ...to("src/a.ts", "@w/core") },
      { to: "packages/core/src/index.ts", via: "workspace", wildcard: false },
    );
    assert.deepEqual(
      { ...to("src/a.ts", "@w/core/sub/thing") },
      { to: "packages/core/src/sub/thing.ts", via: "workspace", wildcard: true },
    );
    assert.match(to("src/a.ts", "@w/core/hidden").problem ?? "", /exports do not include/);
    assert.equal(to("src/a.ts", "legacy").to, "packages/legacy/lib/main.ts");
    assert.match(
      to("src/a.ts", "cond").problem ?? "",
      /whose entry is no file in the tree/,
      "dist is not in the tree and nothing is guessed",
    );
    assert.equal(
      new Resolver(files, { conditions: ["source"] }).resolve("src/a.ts", "cond").to,
      "packages/cond/src/index.ts",
    );
  });

  test("an external package is ignored; a specifier that is no package name is a problem", () => {
    assert.deepEqual({ ...to("src/a.ts", "aws-amplify/data") }, { to: null, via: "package", wildcard: false });
    assert.equal(to("src/a.ts", "node:fs").problem, undefined);
    assert.match(to("src/a.ts", "~/thing").problem ?? "", /not a package name/);
  });

  test("aliasFor finds the configured specifier for a file", () => {
    assert.equal(resolver.aliasFor("src/a.ts", "src/one.ts"), "@one");
    assert.equal(resolver.aliasFor("src/a.ts", "packages/core/src/index.ts"), "@w/core");
    assert.equal(resolver.aliasFor("src/a.ts", "src/b.ts"), null, "a baseUrl path is not an alias");
    assert.equal(resolver.aliasFor("src/a.ts", "src/x/y.ts"), "@x/y");
  });

  test("tsconfig helpers", () => {
    assert.equal(stripJsonComments('{ "a": "//x", /* c */ "b": [1,], }'), '{ "a": "//x",  "b": [1] }');
    assert.equal(matchAlias([{ key: "@a/*", targets: ["src/*"] }], "@a/b/c")?.candidates[0], "src/b/c");
    assert.equal(matchAlias([{ key: "@a/*", targets: ["src/*"] }], "@b/c"), null);
  });
});

describe("Tarjan (VSA005)", () => {
  test("components are found, sorted and deterministic", () => {
    const successors = new Map([
      ["A", ["B"]],
      ["B", ["C"]],
      ["C", ["A", "D"]],
      ["D", ["E"]],
      ["E", ["D"]],
      ["F", []],
    ]);
    const components = stronglyConnected(["F", "E", "D", "C", "B", "A"], successors);
    assert.deepEqual(components, [["A", "B", "C"], ["D", "E"], ["F"]]);
    assert.deepEqual(stronglyConnected(["A", "B", "C", "D", "E", "F"], successors), components);
  });

  test("shortestCycle closes a path through the start", () => {
    const successors = new Map([
      ["A", ["B", "C"]],
      ["B", ["C"]],
      ["C", ["A"]],
    ]);
    assert.deepEqual(shortestCycle("A", successors, new Set(["A", "B", "C"])), ["A", "C", "A"]);
  });
});

const RECORD = {
  id: "EXC-ONE",
  rule: "VSA003",
  paths: ["src/a.ts"],
  rationale: "Migrating.",
  owner: "team-a",
  approver: "team-b",
  created: "2026-01-01",
  expires: "2026-12-31",
  remediation: "ISSUE-1",
};

describe("exceptions (VSA §9)", () => {
  const target = finding({
    code: "VSA003",
    artifact: "SLICE-A",
    path: "src/a.ts",
    location: { line: 3 },
    message: "SLICE-A imports a private file.",
    remediation: "Import the entrypoint.",
    edges: [{ from: "SLICE-A", to: "SLICE-B" }],
  });

  test("a complete record reads; a missing field, bad date or no paths is VSA013", () => {
    assert.ok(readExceptionRecord(RECORD, "x.yaml").record !== null);
    const { approver: _, ...noApprover } = RECORD;
    assert.deepEqual(
      readExceptionRecord(noApprover, "x.yaml").findings.map((f) => f.diagnostic.code),
      ["VSA013"],
    );
    assert.equal(readExceptionRecord({ ...RECORD, expires: "2026-02-30" }, null).record, null);
    assert.equal(readExceptionRecord({ ...RECORD, paths: [] }, null).record, null);
    assert.equal(readExceptionRecord({ ...RECORD, paths: ["../x"] }, null).record, null);
    assert.equal(
      readExceptionRecord({ ...RECORD, expires: "2025-01-01" }, null).record,
      null,
      "expires before created",
    );
  });

  test("covers matches rule and an exact path or edge", () => {
    const record = readExceptionRecord(RECORD, null).record!;
    assert.ok(covers(record, target));
    assert.ok(!covers({ ...record, rule: "VSA004" }, target));
    assert.ok(!covers({ ...record, paths: ["src/b.ts"] }, target));
    assert.ok(covers({ ...record, paths: [], edges: [{ from: "SLICE-A", to: "SLICE-B" }] }, target));
  });

  test("current: a warning naming the exception; expired: VSA013 and the error stays", () => {
    const record = readExceptionRecord(RECORD, "architecture/exceptions/one.yaml").record!;
    const current = applyExceptions([target], [record], "2026-06-01");
    assert.equal(current.excepted, 1);
    assert.equal(current.findings[0].diagnostic.severity, "warning");
    assert.equal(
      current.findings[0].diagnostic.message,
      "SLICE-A imports a private file (excepted by EXC-ONE until 2026-12-31).",
    );
    assert.deepEqual(current.recordFindings, []);

    const expired = applyExceptions([target], [record], "2027-01-01");
    assert.equal(expired.excepted, 0);
    assert.equal(expired.findings[0].diagnostic.severity, "error");
    assert.match(expired.findings[0].diagnostic.message, /exception EXC-ONE expired 2026-12-31/);
    assert.deepEqual(
      expired.recordFindings.map((f) => [f.diagnostic.code, f.diagnostic.severity]),
      [["VSA013", "error"]],
    );
  });

  test("an unused exception is a warning, a duplicate ID an error", () => {
    const record = readExceptionRecord({ ...RECORD, paths: ["src/z.ts"] }, "a.yaml").record!;
    const twice = { ...record, source: "b.yaml" };
    const out = applyExceptions([target], [record, twice], "2026-06-01");
    assert.deepEqual(out.recordFindings.map((f) => [f.diagnostic.code, f.diagnostic.severity]).sort(), [
      ["VSA013", "error"],
      ["VSA013", "warning"],
    ]);
  });
});

describe("baseline (VSA §9)", () => {
  const error = (path: string, message: string): Diagnostic => ({
    code: "VSA003",
    severity: "error",
    origin: "architecture",
    artifact: "SLICE-A",
    path,
    location: { line: 4 },
    message,
    remediation: "Fix it.",
  });
  const known = error("src/a.ts", "SLICE-A imports a private file of SLICE-B.");
  const fresh = error("src/new.ts", "SLICE-A imports a private file of SLICE-B.");

  test("migration: known violations become baselined warnings, new ones stay errors", () => {
    const baseline = writeBaseline([known]);
    assert.deepEqual(Object.keys(baseline[0]), ["code", "path", "artifact", "fingerprint"]);
    const out = applyBaseline([known, fresh], baseline, "migration");
    assert.equal(out.baselined, 1);
    assert.equal(out.diagnostics[0].severity, "warning");
    assert.equal(out.diagnostics[0].message, "SLICE-A imports a private file of SLICE-B (baselined).");
    assert.equal(out.diagnostics[1].severity, "error");
    assert.deepEqual(out.stale, []);
  });

  test("strict mode ignores the baseline", () => {
    const out = applyBaseline([known], writeBaseline([known]), "strict");
    assert.equal(out.baselined, 0);
    assert.equal(out.diagnostics[0].severity, "error");
  });

  test("a moved line keeps its fingerprint; one entry absorbs one diagnostic; unmatched entries are stale", () => {
    assert.equal(fingerprint({ ...known, location: { line: 40 } }), fingerprint(known));
    const out = applyBaseline([known, known], writeBaseline([known]), "migration");
    assert.deepEqual(
      out.diagnostics.map((d) => d.severity),
      ["warning", "error"],
    );
    assert.equal(applyBaseline([], writeBaseline([known])).stale.length, 1);
  });

  test("notes are stripped before fingerprinting, and a baseline round-trips through JSON", () => {
    assert.equal(plainMessage("A thing (excepted by EXC-ONE until 2026-12-31) (baselined)."), "A thing.");
    const baseline = writeBaseline([known, fresh]);
    assert.deepEqual(parseBaseline(JSON.stringify(baseline)), baseline);
    assert.throws(() => parseBaseline("{}"), /JSON array/);
  });
});

describe("configuration", () => {
  test("readArchitectureConfig: known keys read, unknown keys and bad patterns are CFG001 with origin architecture", () => {
    const { config, diagnostics } = readArchitectureConfig(
      "routerFiles:\n- src/app/routes/Router.tsx\nscope:\n- ../outside\nrouters:\n- x\nlayerMatrix:\n  model: [model]\n",
      ".intentset/architecture.yaml",
    );
    assert.deepEqual(config, { routerFiles: ["src/app/routes/Router.tsx"], layerMatrix: { model: ["model"] } });
    assert.deepEqual(
      diagnostics.map((d) => [d.code, d.origin, d.field]),
      [
        ["CFG001", "architecture", "/routers"],
        ["CFG001", "architecture", "/scope/0"],
      ],
    );
  });

  test("a parse failure is CFG001 with its line", () => {
    const { diagnostics } = readArchitectureConfig("a: 1\na: 2\n");
    assert.equal(diagnostics[0].code, "CFG001");
    assert.equal(diagnostics[0].location?.line, 2);
  });

  test("resolveConfig lays partial configurations over the defaults, later winning", () => {
    const config = resolveConfig({ routerFiles: ["a.tsx"] }, { routerFiles: ["b.tsx"], scope: ["src/**"] });
    assert.deepEqual(config.routerFiles, ["b.tsx"]);
    assert.deepEqual(config.scope, ["src/**"]);
    assert.deepEqual(config.backendRoots, ["amplify/**"]);
  });
});

// --- checkArchitecture over a small graph -------------------------------------------

function slice(id: string, root: string, extra = ""): string {
  return `---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: ${id}
  type: slice
  title: ${id}
  status: draft
  owner: team-a
  visibility: internal
  audiences:
  - engineering
${extra}  slice:
    kind: technical
    rationale: Test fixture.
    domain: test
    entrypoint: ${root}/index.ts
    layers: {}
    claims:
    - kind: source
      path: ${root}/**
    usesResources: []
---

# ${id}

## Responsibility

Test.

## Public contract

Test.

## Verification

Test.
`;
}

function graphOf(documents: Record<string, string>): Graph {
  return validate(
    Object.entries(documents).map(([path, text]) => plainCarrier(path, text)),
    EMPTY_REGISTRIES,
  ).graph;
}

describe("checkArchitecture: declared scope and modes", () => {
  const graph = graphOf({
    "SLICE-A.md": slice("SLICE-A", "packages/a/src"),
    "SLICE-B.md": slice("SLICE-B", "packages/b/src"),
  });
  const files = new Map<string, string>([
    ["packages/a/src/index.ts", 'export { b } from "../../b/src/internal";\n'],
    ["packages/b/src/index.ts", "export const b = 1;\n"],
    ["packages/b/src/internal.ts", "export const b = 2;\n"],
    ["legacy/src/old.ts", 'import { b } from "../../packages/b/src/internal";\nexport const old = b;\n'],
    ["amplify/functions/orphan/handler.ts", "export const handler = 1;\n"],
    ["amplify/functions/other/handler.ts", "export const handler = 2;\n"],
  ]);
  const config = { sourceRoots: ["packages/**", "legacy/**"], scope: ["packages/a/**", "amplify/functions/orphan/**"] };

  test("findings in scope are reported, out-of-scope files are counted only", () => {
    const { diagnostics, summary } = checkArchitecture(
      graph,
      EMPTY_REGISTRIES,
      { files },
      { config, today: "2026-10-02" },
    );
    const seen = diagnostics.map((d) => `${d.code} ${d.path}`);
    assert.ok(seen.includes("AMP004 amplify/functions/orphan/handler.ts"));
    assert.ok(!seen.some((s) => s.includes("amplify/functions/other")), "AMP004 outside scope is not reported");
    assert.ok(!seen.some((s) => s.includes("legacy/src/old.ts")), "neither VSA009 nor its import from outside scope");
    assert.ok(
      seen.includes("VSA003 packages/a/src/index.ts"),
      "an in-scope edge into an out-of-scope slice file is checked",
    );
    assert.ok(seen.includes("VSA004 packages/a/src/index.ts"));
    assert.equal(summary.outOfScope, 4);
    assert.equal(summary.slices, 2);
  });

  test("the same input gives the same bytes", () => {
    const one = checkArchitecture(graph, EMPTY_REGISTRIES, { files }, { config, today: "2026-10-02" });
    const two = checkArchitecture(
      graph,
      EMPTY_REGISTRIES,
      { files: new Map([...files].reverse()) },
      { config, today: "2026-10-02" },
    );
    assert.equal(JSON.stringify(one.diagnostics), JSON.stringify(two.diagnostics));
    assert.equal(JSON.stringify(one.summary), JSON.stringify(two.summary));
  });

  test("migration applies a baseline and strict ignores it", () => {
    const first = checkArchitecture(graph, EMPTY_REGISTRIES, { files }, { config, today: "2026-10-02" });
    const baseline = writeBaseline(first.diagnostics);
    const migration = checkArchitecture(
      graph,
      EMPTY_REGISTRIES,
      { files },
      { config, baseline, mode: "migration", today: "2026-10-02" },
    );
    assert.ok(!migration.diagnostics.some((d) => d.severity === "error"));
    assert.equal(migration.summary.baselined, baseline.length);
    const strict = checkArchitecture(
      graph,
      EMPTY_REGISTRIES,
      { files },
      { config, baseline, mode: "strict", today: "2026-10-02" },
    );
    assert.equal(strict.summary.baselined, 0);
    assert.equal(strict.diagnostics.filter((d) => d.severity === "error").length, baseline.length);
  });

  test("exceptions handed in apply like those in the tree", () => {
    const exceptions = [{ ...RECORD, rule: "AMP004", paths: ["amplify/functions/orphan/**"], expires: "2999-01-01" }];
    const { diagnostics, summary } = checkArchitecture(
      graph,
      EMPTY_REGISTRIES,
      { files },
      { config, exceptions, today: "2026-10-02" },
    );
    const amp = diagnostics.find((d) => d.code === "AMP004");
    assert.equal(amp?.severity, "warning");
    assert.match(amp?.message ?? "", /excepted by EXC-ONE until 2999-01-01/);
    assert.equal(summary.excepted, 1);
  });

  test("unresolved lists what could not be checked, with a TS004 warning beside it", () => {
    const withDynamic = new Map(files);
    withDynamic.set("packages/a/src/lazy.ts", "export const load = (name: string) => import(name);\n");
    const { diagnostics, summary } = checkArchitecture(
      graph,
      EMPTY_REGISTRIES,
      { files: withDynamic },
      { config, today: "2026-10-02" },
    );
    assert.deepEqual(summary.unresolved, [
      "packages/a/src/lazy.ts:1: a dynamic import has a computed specifier, so its target cannot be known",
    ]);
    assert.ok(diagnostics.some((d) => d.code === "TS004" && d.severity === "warning" && d.location?.line === 1));
    assert.ok(summary.reviewRequired.some((rule) => rule.startsWith("VSA012")));
  });
});
