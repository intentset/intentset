/**
 * Stage the published suite: every case in tests/*.json expanded into whole
 * files (ADR 0006), the normative schemas, the example the cases are built
 * from, and the consumer fixtures of tests/consumer/ as they are (spec/export.md
 * §6). Run by `pnpm run build`; never committed.
 *
 * The expanded form carries no `baseline`, `patch`, `registries` or `config`:
 * the registries and config are inside `files`, as `registries.yaml` and
 * `.intentset/config.yaml`, so a consumer reads one map as a repository tree
 * and needs no patch logic of its own.
 *
 * This is a build script, not part of the package: it reaches the harness and
 * core through the workspace, and nothing it imports ships.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { type ConformanceCase, expandCase, treeOf, validateSchema } from "@intentset/conformance";
import type { ParseYaml } from "@intentset/conformance/fixtures";

export const packageDir = resolve(import.meta.dirname);
const repoRoot = resolve(packageDir, "..", "..");

export const SCHEMAS = ["conformance", "frontmatter", "export", "evidence"] as const;
export const EXAMPLES = ["scheduling"] as const;

/** The keys a staged case may carry, in the order they are written. */
const STAGED_KEYS = [
  "section",
  "name",
  "files",
  "sources",
  "level",
  "evidence",
  "request",
  "valid",
  "diagnostics",
  "artifacts",
  "export",
  "published",
  "notes",
] as const;

export type StagedCase = Pick<ConformanceCase, (typeof STAGED_KEYS)[number]>;

export interface StageOptions {
  /** Where to write; the package directory by default. */
  into?: string;
  /** The YAML reader patches are applied with. */
  parseYaml: ParseYaml;
  testsDir?: string;
  specDir?: string;
  examplesDir?: string;
}

export interface Staged {
  /** Section names staged, sorted. */
  sections: string[];
  /** Schema names copied, in SCHEMAS order; one not yet written in spec/ is left out. */
  schemas: string[];
  cases: number;
  /** Consumer fixture files copied, the manifest included. */
  consumer: number;
}

export function stage(options: StageOptions): Staged {
  const into = options.into ?? packageDir;
  const testsDir = options.testsDir ?? join(repoRoot, "tests");
  const specDir = options.specDir ?? join(repoRoot, "spec");
  const examplesDir = options.examplesDir ?? join(repoRoot, "examples");

  const schema = JSON.parse(readFileSync(join(specDir, "conformance.schema.json"), "utf8"));

  for (const dir of ["cases", "schemas", "examples", "consumer"]) {
    rmSync(join(into, dir), { recursive: true, force: true });
    mkdirSync(join(into, dir), { recursive: true });
  }

  const sections = readdirSync(testsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => basename(name, ".json"))
    .sort();

  let count = 0;
  for (const section of sections) {
    const cases = JSON.parse(readFileSync(join(testsDir, `${section}.json`), "utf8")) as ConformanceCase[];
    const staged = cases.map((testCase) => expand(testCase, { examplesDir, parseYaml: options.parseYaml }));
    const errors = validateSchema(schema, staged);
    if (errors.length > 0) {
      throw new Error(`staged ${section} does not satisfy the schema: ${errors[0].path} ${errors[0].message}`);
    }
    writeFileSync(join(into, "cases", `${section}.json`), `${JSON.stringify(staged, null, 2)}\n`);
    count += staged.length;
  }

  const schemas: string[] = [];
  for (const name of SCHEMAS) {
    const source = join(specDir, `${name}.schema.json`);
    if (!existsSync(source)) continue;
    cpSync(source, join(into, "schemas", `${name}.schema.json`));
    schemas.push(name);
  }

  for (const name of EXAMPLES) {
    cpSync(join(examplesDir, name), join(into, "examples", name), { recursive: true });
  }

  // Already whole envelopes, each read the way a consumer reads it: copied, not expanded.
  const consumerDir = join(testsDir, "consumer");
  const consumer = existsSync(consumerDir) ? readdirSync(consumerDir).sort() : [];
  for (const name of consumer) cpSync(join(consumerDir, name), join(into, "consumer", name));

  return { sections, schemas, cases: count, consumer: consumer.length };
}

/** One case in its expanded form, keys in STAGED_KEYS order. */
export function expand(testCase: ConformanceCase, options: { examplesDir: string; parseYaml: ParseYaml }): StagedCase {
  const expanded = expandCase(testCase, options);
  const full: StagedCase = {
    section: testCase.section,
    name: testCase.name,
    files: Object.fromEntries(treeOf(expanded)),
    sources: expanded.sources.size > 0 ? Object.fromEntries(expanded.sources) : undefined,
    level: expanded.level,
    evidence: testCase.evidence,
    request: testCase.request,
    valid: testCase.valid,
    diagnostics: testCase.diagnostics,
    artifacts: testCase.artifacts,
    export: testCase.export,
    published: testCase.published,
    notes: testCase.notes,
  };
  const staged: Record<string, unknown> = {};
  for (const key of STAGED_KEYS) {
    if (full[key] !== undefined) staged[key] = full[key];
  }
  return staged as StagedCase;
}

if (process.argv[1] === import.meta.filename) {
  const { parseYaml } = await import("@intentset/core");
  const staged = stage({ parseYaml });
  process.stdout.write(
    `conformance-suite: staged ${staged.cases} case(s) in ${staged.sections.length} section(s), ` +
      `${staged.schemas.length} schema(s), ${EXAMPLES.length} example(s) and ${staged.consumer} consumer fixture file(s)\n`,
  );
}
