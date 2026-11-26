/**
 * The publisher writes `help.json` and `@intentset/help` reads it, and each package keeps its own copy of the file's
 * types (the publisher does not depend on the help package). This test holds the two together: every help file the
 * conformance cases publish passes `readHelp`, and the publisher's types are assignable to the reader's, which
 * `pnpm run typecheck` checks. The root links every workspace package, so no package gains a dependency.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { ConformanceCase } from "@intentset/conformance";
import { expandCase } from "@intentset/conformance";
import {
  type DocumentInput,
  EMPTY_REGISTRIES,
  type Registries,
  SURFACE_ID_DIGITS,
  SURFACE_ID_PATTERN,
  graphHash,
  parseYaml,
  plainCarrier,
  readRegistries,
  validate,
} from "@intentset/core";
import type * as Help from "@intentset/help";
import { readHelp, SURFACE_ID_DIGITS as HELP_DIGITS, SURFACE_ID_PATTERN as HELP_PATTERN } from "@intentset/help";
import type * as Publisher from "@intentset/publisher";
import { type PublicationRequest, bindReviewPins, publish } from "@intentset/publisher";

const root = resolve(import.meta.dirname, "..");

// Compile-time: the publisher's help-file types are assignable to the reader's.
const _file = (file: Publisher.HelpFile): Help.Help => file;
const _knowledge = (entry: Publisher.HelpKnowledge): Help.HelpKnowledge => entry;
const _tip = (tip: Publisher.HelpTip): Help.HelpTip => tip;
const _surface = (surface: Publisher.HelpSurface): Help.HelpSurface => surface;
// A document's publication block carries what servedTo reads, so a retrieval layer tests it with the same function.
const _block = (meta: Publisher.PublicationMeta): Pick<Help.Help, "projection" | "audience" | "availability"> => meta;
void [_file, _knowledge, _tip, _surface, _block];

test("BEH-HELP-READER, BEH-PUBLISH-UNDER-REVIEW, BEH-PUBLISH-SURFACES: every help file the publication cases write passes readHelp, kept documents and surfaces included", () => {
  const cases = JSON.parse(readFileSync(join(root, "tests", "publication.json"), "utf8")) as ConformanceCase[];
  let read = 0;
  let kept = 0;
  let surfaced = 0;
  for (const testCase of cases) {
    const expanded = expandCase(testCase, { examplesDir: join(root, "examples"), parseYaml });
    const inputs: DocumentInput[] = [];
    for (const [path, source] of expanded.files) if (path.endsWith(".md")) inputs.push(plainCarrier(path, source));
    let registries: Registries = EMPTY_REGISTRIES;
    if (expanded.registriesText !== null) {
      registries = readRegistries(expanded.registriesText, "registries.yaml").registries;
    }
    const graph = bindReviewPins(validate(inputs, registries).graph);
    const published = publish(graph, registries, (expanded.request ?? {}) as unknown as PublicationRequest, {
      snapshot: { commit: null, graphHash: graphHash(graph) },
      publishedAt: "2026-01-01T00:00:00Z",
    });
    if (published.help === null) continue;
    const result = readHelp(`${JSON.stringify(published.help, null, 2)}\n`);
    assert.deepEqual(result.problems, [], testCase.name);
    read++;
    // ADR 0027: a document kept under review is in the file, marked, and the reader accepts it.
    if (published.help.knowledge.some((entry) => entry.underReview === true)) kept++;
    // ADR 0028: a written surface names only articles the file lists, and the reader accepts it.
    if (Object.keys(published.help.surfaces).length > 0) surfaced++;
  }
  assert.ok(read > 20, `${read} help files read`);
  assert.ok(kept > 5, `${kept} help files with a document kept under review read`);
  assert.ok(surfaced > 5, `${surfaced} help files with a surface read`);
});

test("BEH-HELP-SURFACES: the help reader's surface ID rules are core's, copied because the package imports nothing", () => {
  assert.equal(HELP_PATTERN.source, SURFACE_ID_PATTERN.source);
  assert.equal(HELP_PATTERN.flags, SURFACE_ID_PATTERN.flags);
  assert.equal(HELP_DIGITS.source, SURFACE_ID_DIGITS.source);
});
