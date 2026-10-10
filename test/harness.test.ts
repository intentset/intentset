import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { Diagnostic } from "@intentset/core";
import { type Driver, formatJson, formatReport, runSuite, suitePassed } from "@intentset/conformance";

const root = resolve(import.meta.dirname, "..");
const schemaPath = join(root, "spec", "conformance.schema.json");

/**
 * A stand-in for an implementation: a file whose body says BAD gets one
 * error, a file whose body says WARN gets one warning, and the artifact list
 * is the file names. It exists so the harness's own comparison logic is
 * tested with no dependence on the real checks or the real fixtures.
 */
const synthetic: Driver = (expanded) => {
  const diagnostics: Diagnostic[] = [];
  for (const [path, text] of expanded.files) {
    if (text.includes("BAD")) diagnostics.push(diagnostic("SYN001", "error", path));
    if (text.includes("WARN")) diagnostics.push(diagnostic("SYN002", "warning", path));
  }
  return {
    valid: !diagnostics.some((d) => d.severity === "error"),
    diagnostics,
    artifacts: [...expanded.files.keys()].map((p) => p.replace(/\.md$/, "")),
    export: { contract: "test/export", level: expanded.level, registries: expanded.registriesText },
    published: { ids: ["KB-ONE"], text: `published ${expanded.request?.audience ?? "nobody"}` },
  };
};

function diagnostic(code: string, severity: "error" | "warning", path: string): Diagnostic {
  return { code, severity, origin: "graph", artifact: null, path, message: code, remediation: "" };
}

const cases = [
  {
    section: "synthetic",
    name: "passes on every aspect",
    baseline: "sample",
    files: { "B.md": null },
    valid: true,
    diagnostics: [],
    artifacts: ["A"],
    export: { contract: "test/export", registries: "owners: []\n" },
    published: { ids: ["KB-ONE"], mustNotContain: ["secret"] },
    request: { audience: "teacher" },
  },
  {
    section: "synthetic",
    name: "warnings count as diagnostics but not against validity",
    baseline: "sample",
    files: { "B.md": "WARN\n" },
    valid: true,
    diagnostics: ["SYN002"],
  },
  {
    section: "synthetic",
    name: "fails on validity, diagnostics, artifacts, export and publication",
    baseline: "sample",
    files: { "B.md": "BAD\n" },
    valid: true,
    artifacts: ["A", "C"],
    export: { level: "L2" },
    published: { ids: ["KB-TWO"], mustNotContain: ["teacher"] },
    request: { audience: "teacher" },
  },
  {
    section: "synthetic",
    name: "an aspect the driver does not report is skipped",
    files: { "X.md": "fine\n" },
    valid: true,
    artifacts: ["X"],
  },
];

async function withSuite<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "intentset-harness-"));
  try {
    await mkdir(join(dir, "tests"));
    await mkdir(join(dir, "examples", "sample"), { recursive: true });
    await writeFile(join(dir, "examples", "sample", "A.md"), "# A\n");
    await writeFile(join(dir, "examples", "sample", "B.md"), "# B\n");
    await writeFile(join(dir, "examples", "sample", "registries.yaml"), "owners: []\n");
    await writeFile(join(dir, "tests", "synthetic.json"), JSON.stringify(cases, null, 2));
    await writeFile(
      join(dir, "tests", "undriven.json"),
      JSON.stringify([{ section: "undriven", name: "waits for a driver", files: {}, valid: true }]),
    );
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const options = (dir: string, section?: string) => ({
  drivers: { synthetic },
  parseYaml: () => {
    throw new Error("no case here patches frontmatter");
  },
  testsDir: join(dir, "tests"),
  examplesDir: join(dir, "examples"),
  schemaPath,
  section,
});

test("the harness passes what matches, fails what does not, and skips what nobody reports", async () => {
  await withSuite(async (dir) => {
    const result = await runSuite(options(dir));
    assert.deepEqual(
      result.files.map((f) => f.section),
      ["synthetic", "undriven"],
    );
    const [synthetic, undriven] = result.files;
    assert.deepEqual(synthetic.fileErrors, []);
    assert.deepEqual(synthetic.schemaErrors, []);

    const byName = Object.fromEntries(synthetic.cases.map((c) => [c.name, c.aspects]));
    assert.deepEqual(byName["passes on every aspect"], [
      { aspect: "valid", status: "pass" },
      { aspect: "diagnostics", status: "pass" },
      { aspect: "artifacts", status: "pass" },
      { aspect: "export", status: "pass" },
      { aspect: "published", status: "pass" },
    ]);
    assert.deepEqual(byName["warnings count as diagnostics but not against validity"], [
      { aspect: "valid", status: "pass" },
      { aspect: "diagnostics", status: "pass" },
    ]);

    const failing = byName["fails on validity, diagnostics, artifacts, export and publication"];
    assert.deepEqual(
      failing.map((a) => [a.aspect, a.status]),
      [
        ["valid", "fail"],
        ["diagnostics", "fail"],
        ["artifacts", "fail"],
        ["export", "fail"],
        ["published", "fail"],
      ],
    );
    const detail = (aspect: string) => failing.find((a) => a.aspect === aspect)?.detail ?? "";
    assert.equal(detail("valid"), "expected valid=true, got false (diagnostics: SYN001:error)");
    assert.match(
      detail("diagnostics"),
      /^unexpected SYN001 \(expected 0, got 1\); expected \[\], got:\n\s+SYN001 error graph B\.md: SYN001$/,
    );
    assert.equal(detail("artifacts"), "missing [C], unexpected [B]; got [A, B]");
    assert.equal(detail("export"), '/level: expected "L2", got "L1"');
    assert.equal(
      detail("published"),
      'ids: missing [KB-TWO], unexpected [KB-ONE]; got [KB-ONE]; output contains "teacher"',
    );

    assert.deepEqual(byName["an aspect the driver does not report is skipped"], [
      { aspect: "valid", status: "pass" },
      { aspect: "diagnostics", status: "pass" },
      { aspect: "artifacts", status: "pass" },
    ]);

    assert.deepEqual(undriven.cases[0].aspects, [
      { aspect: "driver", status: "skip", detail: 'no driver for section "undriven"' },
    ]);

    assert.deepEqual(result.totals, { pass: 10, fail: 5, skip: 1 });
    assert.equal(suitePassed(result), false);
  });
});

test("a driver that reports an aspect the case does not pin is not judged on it", async () => {
  // The synthetic driver always returns export and published; the second case
  // pins neither, and nothing about them appears in its aspects.
  await withSuite(async (dir) => {
    const result = await runSuite(options(dir, "synthetic"));
    assert.equal(result.files.length, 1, "--section restricts the run");
    const warned = result.files[0].cases[1];
    assert.deepEqual(
      warned.aspects.map((a) => a.aspect),
      ["valid", "diagnostics"],
    );
  });
});

test("a malformed case file is a file error, and the run fails on it alone", async () => {
  await withSuite(async (dir) => {
    await writeFile(
      join(dir, "tests", "synthetic.json"),
      JSON.stringify([
        { section: "synthetic", name: "fine", files: {}, valid: true },
        { section: "other", name: "fine", files: {}, valid: true },
      ]),
    );
    await writeFile(join(dir, "tests", "broken.json"), "[{");
    await writeFile(
      join(dir, "tests", "unschematic.json"),
      JSON.stringify([{ section: "unschematic", name: "x", valid: true, diagnostics: ["core1"] }]),
    );
    const result = await runSuite(options(dir));
    const byName = Object.fromEntries(result.files.map((f) => [f.section, f]));
    assert.match(byName.broken.fileErrors[0], /could not read as JSON/);
    assert.deepEqual(
      byName.unschematic.schemaErrors.map((e) => e.path),
      ["/0/diagnostics/0"],
    );
    assert.deepEqual(byName.synthetic.fileErrors, [
      'case 2 declares section "other" but lives in synthetic.json',
      'case 2 repeats the name "fine"; names are unique in a section',
    ]);
    assert.deepEqual(byName.synthetic.cases, [], "a malformed file runs no case");
    assert.equal(result.totals.fail, 0);
    assert.equal(suitePassed(result), false, "a file error fails the run even with nothing to count");
  });
});

test("a driver that throws, and a fixture that cannot expand, each fail their own aspect", async () => {
  await withSuite(async (dir) => {
    await writeFile(
      join(dir, "tests", "synthetic.json"),
      JSON.stringify([
        { section: "synthetic", name: "throws", files: {}, valid: true },
        {
          section: "synthetic",
          name: "patches a missing file",
          files: {},
          patch: { "Z.md": { body: "x" } },
          valid: true,
        },
      ]),
    );
    const result = await runSuite({
      ...options(dir),
      drivers: {
        synthetic: () => {
          throw new Error("boom");
        },
      },
    });
    const [thrown, unexpandable] = result.files[0].cases;
    assert.equal(thrown.aspects[0].aspect, "driver");
    assert.equal(thrown.aspects[0].status, "fail");
    assert.match(thrown.aspects[0].detail ?? "", /^driver threw: Error: boom/);
    assert.equal(unexpandable.aspects[0].aspect, "fixture");
    assert.match(unexpandable.aspects[0].detail ?? "", /patch names Z\.md/);
  });
});

test("the report shows per-section counts, failures with their detail, and the same as JSON", async () => {
  await withSuite(async (dir) => {
    const result = await runSuite(options(dir));
    const text = formatReport(result, { root: dir });
    const lines = text.split("\n");
    assert.equal(lines[0], "synthetic  (tests/synthetic.json)  4 case(s)  pass 10  fail 5  skip 0");
    assert.ok(lines.includes("  ✗ #3 fails on validity, diagnostics, artifacts, export and publication"));
    assert.ok(lines.includes("      valid: expected valid=true, got false (diagnostics: SYN001:error)"));
    assert.ok(!lines.some((l) => l.includes("#1 passes on every aspect")), "passing cases are quiet by default");
    assert.ok(lines.includes("undriven  (tests/undriven.json)  1 case(s)  pass 0  fail 0  skip 1"));
    assert.ok(lines.includes('      driver: skipped (no driver for section "undriven")'));
    assert.equal(lines.at(-1), "aspects: 10 passed, 5 failed, 1 skipped");

    const verbose = formatReport(result, { root: dir, verbose: true }).split("\n");
    assert.ok(verbose.includes("  ✓ #1 passes on every aspect"));

    const json = JSON.parse(formatJson(result)) as {
      sections: { section: string; cases: number; pass: number; fail: number; skip: number; malformed: boolean }[];
      totals: { pass: number; fail: number; skip: number };
      files: { cases: { name: string }[] }[];
    };
    assert.deepEqual(json.sections, [
      { section: "synthetic", cases: 4, malformed: false, pass: 10, fail: 5, skip: 0 },
      { section: "undriven", cases: 1, malformed: false, pass: 0, fail: 0, skip: 1 },
    ]);
    assert.deepEqual(json.totals, { pass: 10, fail: 5, skip: 1 });
    assert.equal(json.files[0].cases[2].name, "fails on validity, diagnostics, artifacts, export and publication");
  });
});
