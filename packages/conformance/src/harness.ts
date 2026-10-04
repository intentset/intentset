import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { compareCodes, compareIds, firstMismatch } from "./compare.ts";
import { expandCase, type ParseYaml } from "./fixtures.ts";
import { type Schema, validateSchema } from "./schema.ts";
import type {
  Actual,
  AspectResult,
  CaseResult,
  ConformanceCase,
  Driver,
  ExpandedCase,
  FileResult,
  SectionTotals,
  SuiteResult,
  Totals,
} from "./types.ts";

export type { ConformanceCase, Driver, ExpandedCase, Actual } from "./types.ts";
export { expandCase, serializeYaml, treeOf } from "./fixtures.ts";
export { validateSchema } from "./schema.ts";

/** Repository root, derived from this file's location: packages/conformance/src -> root. */
export const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
export const defaultTestsDir = join(repoRoot, "tests");
export const defaultExamplesDir = join(repoRoot, "examples");
export const defaultSchemaPath = join(repoRoot, "spec", "conformance.schema.json");

export interface SuiteOptions {
  drivers: Record<string, Driver>;
  /** The YAML reader patches are applied with: core's, from the CLI. */
  parseYaml: ParseYaml;
  testsDir?: string;
  examplesDir?: string;
  schemaPath?: string;
  /** Restrict the run to one section (file basename). */
  section?: string;
}

export async function runSuite(options: SuiteOptions): Promise<SuiteResult> {
  const testsDir = options.testsDir ?? defaultTestsDir;
  const schemaPath = options.schemaPath ?? defaultSchemaPath;
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Schema;

  const names = (await readdir(testsDir))
    .filter((name) => name.endsWith(".json"))
    .filter((name) => options.section === undefined || basename(name, ".json") === options.section)
    .sort();

  const files: FileResult[] = [];
  for (const name of names) {
    files.push(await runFile(join(testsDir, name), schema, options));
  }
  return { files, totals: tally(files) };
}

async function runFile(path: string, schema: Schema, options: SuiteOptions): Promise<FileResult> {
  const section = basename(path, ".json");
  const result: FileResult = { file: path, section, fileErrors: [], schemaErrors: [], cases: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    result.fileErrors.push(`could not read as JSON: ${(error as Error).message}`);
    return result;
  }

  result.schemaErrors = validateSchema(schema, parsed);
  if (result.schemaErrors.length > 0) return result;

  const cases = parsed as ConformanceCase[];
  const seen = new Set<string>();
  cases.forEach((testCase, index) => {
    if (testCase.section !== section) {
      result.fileErrors.push(`case ${index + 1} declares section "${testCase.section}" but lives in ${section}.json`);
    }
    if (seen.has(testCase.name)) {
      result.fileErrors.push(`case ${index + 1} repeats the name "${testCase.name}"; names are unique in a section`);
    }
    seen.add(testCase.name);
  });
  if (result.fileErrors.length > 0) return result;

  const driver = options.drivers[section];
  for (const [index, testCase] of cases.entries()) {
    result.cases.push(await runCase(testCase, index + 1, driver, options));
  }
  return result;
}

export async function runCase(
  testCase: ConformanceCase,
  index: number,
  driver: Driver | undefined,
  options: Pick<SuiteOptions, "parseYaml" | "examplesDir">,
): Promise<CaseResult> {
  const name = testCase.name;
  if (!driver) {
    return {
      index,
      name,
      aspects: [{ aspect: "driver", status: "skip", detail: `no driver for section "${testCase.section}"` }],
    };
  }

  let expanded: ExpandedCase;
  try {
    expanded = expandCase(testCase, {
      examplesDir: options.examplesDir ?? defaultExamplesDir,
      parseYaml: options.parseYaml,
    });
  } catch (error) {
    return { index, name, aspects: [{ aspect: "fixture", status: "fail", detail: describeError(error) }] };
  }

  let actual: Actual;
  try {
    actual = await driver(expanded, testCase);
  } catch (error) {
    return {
      index,
      name,
      aspects: [{ aspect: "driver", status: "fail", detail: `driver threw: ${describeError(error)}` }],
    };
  }

  return { index, name, aspects: compareCase(testCase, actual) };
}

function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export function compareCase(expected: ConformanceCase, actual: Actual): AspectResult[] {
  const aspects: AspectResult[] = [];

  for (const problem of actual.problems ?? []) {
    aspects.push({ aspect: "driver", status: "fail", detail: problem });
  }

  aspects.push(
    expected.valid === actual.valid
      ? { aspect: "valid", status: "pass" }
      : {
          aspect: "valid",
          status: "fail",
          detail: `expected valid=${expected.valid}, got ${actual.valid}${describeCodes(actual)}`,
        },
  );

  const codes = compareCodes(expected.diagnostics ?? [], actual.diagnostics);
  aspects.push(
    codes === null
      ? { aspect: "diagnostics", status: "pass" }
      : { aspect: "diagnostics", status: "fail", detail: codes },
  );

  if (expected.artifacts !== undefined) {
    if (actual.artifacts === undefined) {
      aspects.push({ aspect: "artifacts", status: "skip", detail: "driver reported no artifact list" });
    } else {
      const diff = compareIds(expected.artifacts, actual.artifacts);
      aspects.push(
        diff ? { aspect: "artifacts", status: "fail", detail: diff } : { aspect: "artifacts", status: "pass" },
      );
    }
  }

  if (expected.export !== undefined) {
    if (actual.export === undefined) {
      aspects.push({ aspect: "export", status: "skip", detail: "driver produced no export" });
    } else {
      const diff = firstMismatch(expected.export, actual.export);
      aspects.push(diff ? { aspect: "export", status: "fail", detail: diff } : { aspect: "export", status: "pass" });
    }
  }

  if (expected.published !== undefined) {
    if (actual.published === undefined) {
      aspects.push({ aspect: "published", status: "skip", detail: "driver produced no publication" });
    } else {
      const details: string[] = [];
      if (expected.published.ids !== undefined) {
        const diff = compareIds(expected.published.ids, actual.published.ids);
        if (diff) details.push(`ids: ${diff}`);
      }
      for (const text of expected.published.mustContain ?? []) {
        if (!actual.published.text.includes(text)) details.push(`output lacks ${JSON.stringify(text)}`);
      }
      for (const text of expected.published.mustNotContain ?? []) {
        if (actual.published.text.includes(text)) details.push(`output contains ${JSON.stringify(text)}`);
      }
      aspects.push(
        details.length === 0
          ? { aspect: "published", status: "pass" }
          : { aspect: "published", status: "fail", detail: details.join("; ") },
      );
    }
  }

  return aspects;
}

function describeCodes(actual: Actual): string {
  const codes = actual.diagnostics.map((d) => `${d.code}:${d.severity}`).sort();
  return codes.length === 0 ? " (no diagnostics)" : ` (diagnostics: ${codes.join(", ")})`;
}

export function tally(files: readonly FileResult[]): Totals {
  const totals: Totals = { pass: 0, fail: 0, skip: 0 };
  for (const file of files) {
    for (const testCase of file.cases) {
      for (const aspect of testCase.aspects) totals[aspect.status]++;
    }
  }
  return totals;
}

export function sectionTotals(file: FileResult): SectionTotals {
  const totals = tally([file]);
  return {
    section: file.section,
    cases: file.cases.length,
    malformed: file.fileErrors.length > 0 || file.schemaErrors.length > 0,
    ...totals,
  };
}

/** True when nothing failed and every file was well-formed. Skips do not count against the suite. */
export function suitePassed(result: SuiteResult): boolean {
  return result.totals.fail === 0 && result.files.every((file) => !sectionTotals(file).malformed);
}
