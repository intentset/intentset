/**
 * The diagnostic codes the specifications name, the codes the conformance
 * suite exercises and the codes the implementation reports are one set.
 *
 * Read on 2026-10-05: six codes the implementation reported (EVID001 to
 * EVID003, CFG001, CFG002, VSA013) were named by no specification, so their
 * meaning lived only in source, and ten specified codes had no case, with
 * nothing to say which of them were review assertions no tool checks. Agents
 * read the specifications as the truth; a code they cannot look up, or one
 * they expect a tool to report and none does, misleads them.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

/**
 * Codes the specifications define as review assertions: a reviewer asserts
 * each, no reference check reports one, and the suite has no case for one.
 * Each is said to be a review assertion where it is defined. Implementing a
 * check for one means taking it off this list and giving it cases.
 */
const REVIEW_ONLY = ["AMP003", "AMP005", "AMP012", "AMP013", "TS005", "VSA007", "VSA008", "VSA010", "VSA011", "VSA012"];

/** Intentset's own code shape (Core §11). Markset's codes, origin `syntax`, are Markset's to specify. */
const CODE = /\b[A-Z]{2,5}[0-9]{3}\b/gu;

async function specTexts(): Promise<Map<string, string>> {
  const dir = join(root, "spec");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  return new Map(await Promise.all(files.map(async (f) => [f, await readFile(join(dir, f), "utf8")] as const)));
}

async function specCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  for (const text of (await specTexts()).values()) for (const [code] of text.matchAll(CODE)) codes.add(code);
  return codes;
}

/** Every code a case expects, across tests/*.json. */
async function fixtureCodes(): Promise<Set<string>> {
  const dir = join(root, "tests");
  const codes = new Set<string>();
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    const cases = JSON.parse(await readFile(join(dir, file), "utf8")) as Array<{ diagnostics?: string[] }>;
    for (const c of cases) {
      for (const code of c.diagnostics ?? []) if (/^[A-Z]+[0-9]{3}$/u.test(code)) codes.add(code);
    }
  }
  return codes;
}

/** Every code the implementation writes as a literal, in packages/{name}/src. */
async function implementationCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".ts")) {
        for (const [, code] of (await readFile(path, "utf8")).matchAll(/code: "([A-Z]+[0-9]{3})"/gu)) codes.add(code);
      }
    }
  };
  const packages = await readdir(join(root, "packages"), { withFileTypes: true });
  for (const p of packages) if (p.isDirectory()) await walk(join(root, "packages", p.name, "src")).catch(() => {});
  return codes;
}

const sorted = (set: Iterable<string>) => [...set].sort();

test("the codes the specifications name are the codes the suite exercises, plus the declared review assertions", async () => {
  const spec = await specCodes();
  const fixtures = await fixtureCodes();
  assert.ok(spec.size > 40, `found only ${spec.size} codes in spec/`);
  assert.deepEqual(sorted(spec), sorted(new Set([...fixtures, ...REVIEW_ONLY])));
  for (const code of REVIEW_ONLY) assert.ok(!fixtures.has(code), `${code} has cases, so it is not review-only`);
});

test("every code the implementation reports is specified, and none of the review assertions", async () => {
  const spec = await specCodes();
  const implemented = await implementationCodes();
  assert.ok(implemented.size > 30, `found only ${implemented.size} codes in packages/*/src`);
  for (const code of implemented) assert.ok(spec.has(code), `${code} is reported but no specification names it`);
  for (const code of REVIEW_ONLY) assert.ok(!implemented.has(code), `${code} is reported, so it is not review-only`);
});

test("each review assertion is called one where the specification defines it", async () => {
  // Where a code's row or sentence is, the same paragraph says it is a review
  // assertion, so a reader looking it up learns no tool reports it.
  const texts = await specTexts();
  for (const code of REVIEW_ONLY) {
    const paragraphs = [...texts.values()].flatMap((t) => t.split(/\n\s*\n/u));
    const said = paragraphs.some(
      (p) => p.includes(code) && /review assertions? in v0\.1|are review assertions/u.test(p),
    );
    assert.ok(said, `no paragraph that names ${code} says it is a review assertion`);
  }
});
