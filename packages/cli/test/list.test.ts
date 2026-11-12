/**
 * `intentset list` (spec/list.md, BEH-LIST): the options compiled to a selector, the three formats, the export as a
 * source, the exit codes, and that it writes nothing. What a selector matches is held by tests/list.json.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { edit, example, run, snapshot, temp } from "./helpers.ts";

test("BEH-LIST: fields combine with AND, the values of one option with OR, and the table names its snapshot and counts", async (t) => {
  const dir = await example(t);
  const both = await run(dir, "list", "--type", "rule,scenario");
  assert.equal(both.code, 0, both.err);
  assert.match(both.out, /^Snapshot: /);
  assert.match(both.out, /Validation: pass at L1, 0 errors, 0 warnings/);
  assert.match(both.out, /Selector: type rule or scenario\n/);
  assert.match(both.out, /Considered 15 \(0 withheld\), matched 3, undetermined 0/);
  for (const id of ["RULE-ASMT-AUTH", "RULE-ASMT-FUTURE", "SCN-ASMT-SCHEDULE"]) assert.match(both.out, new RegExp(id));

  const repeated = await run(dir, "list", "--type", "rule", "--type", "scenario", "--format", "ids");
  assert.equal(repeated.out, "RULE-ASMT-AUTH\nRULE-ASMT-FUTURE\nSCN-ASMT-SCHEDULE\n");
  const and = await run(dir, "list", "--type", "rule,scenario", "--id", "RULE-*", "--format", "ids");
  assert.equal(and.out, "RULE-ASMT-AUTH\nRULE-ASMT-FUTURE\n");
});

test("BEH-LIST: --json is the intentset/list/0.1 result, the same bytes twice", async (t) => {
  const dir = await example(t);
  const first = await run(dir, "list", "--under", "OUT-PREPARE", "--json");
  const second = await run(dir, "list", "--under", "OUT-PREPARE", "--format", "json");
  assert.equal(first.code, 0, first.err);
  assert.equal(first.out, second.out);
  const result = JSON.parse(first.out);
  assert.equal(result.contract, "intentset/list/0.1");
  assert.equal(result.source, "tree");
  assert.equal(result.snapshot.repository, "example/lantern");
  assert.deepEqual(result.selector, { under: ["OUT-PREPARE"] });
  assert.deepEqual(result.counts, { considered: 15, withheld: 0, matched: 4, undetermined: 0 });
  assert.deepEqual(
    result.rows.map((row: { id: string }) => row.id),
    ["BEH-ASMT-SCHEDULE", "CAP-ASMT-ASSIGN", "MEAS-PREPARE-ADOPTION", "MEAS-PREPARE-MINUTES"],
  );
  assert.equal(result.rows[0].reviewedBy, null);
  assert.equal(result.countBy, null);
});

test("BEH-LIST: --has compiles to a link predicate with its quantifier, and --count-by counts", async (t) => {
  const dir = await example(t);
  const none = await run(dir, "list", "--type", "behavior", "--has", "none:in:verifies", "--format", "ids");
  assert.equal(none.code, 0, none.err);
  assert.equal(none.out, "");
  const some = await run(dir, "list", "--has", "out:governedBy=draft,approved", "--json");
  const result = JSON.parse(some.out);
  assert.deepEqual(result.selector.links, [
    { direction: "out", kind: "governedBy", quantifier: "some", match: { statuses: ["approved", "draft"] } },
  ]);
  assert.deepEqual(
    result.rows.map((row: { id: string }) => row.id),
    ["BEH-ASMT-SCHEDULE"],
  );
  const counted = await run(dir, "list", "--count-by", "type");
  assert.match(counted.out, /type +count\n/);
  assert.match(counted.out, /measure +2\n/);
  assert.doesNotMatch(counted.out, /%/);
});

test("BEH-LIST, BEH-DELIVERY: --delivery selects the effective delivery, and an approved record is not built", async (t) => {
  const dir = await example(t);
  edit(dir, "BEH-ASMT-SCHEDULE", "status: draft", "status: draft\n  delivery: built");
  edit(dir, "RULE-ASMT-AUTH", "status: draft", "status: implemented");
  edit(dir, "RULE-ASMT-FUTURE", "status: draft", "status: approved");
  const built = await run(dir, "list", "--delivery", "built", "--format", "ids");
  assert.equal(built.code, 0, built.err);
  assert.equal(built.out, "BEH-ASMT-SCHEDULE\nRULE-ASMT-AUTH\n");
  const table = await run(dir, "list", "--status", "draft", "--delivery", "built");
  assert.match(table.out, /Selector: status draft, and delivery built\n/);
  const unstated = await run(dir, "list", "--type", "rule", "--delivery", "unstated", "--format", "ids");
  assert.equal(unstated.out, "RULE-ASMT-FUTURE\n");
  const bad = await run(dir, "list", "--delivery", "implemented");
  assert.equal(bad.code, 2);
  assert.match(bad.err, /--delivery: implemented is not one of planned, built, unstated/);
});

test("BEH-LIST: --from reads an export alone and gives the tree's answer, with review fields not supplied", async (t) => {
  const dir = await example(t);
  const out = join(temp(t), "graph.json");
  assert.equal((await run(dir, "graph", "--out", out)).code, 0);
  const tree = await run(dir, "list", "--describing", "SLICE-ASMT-SCHEDULE", "--json");
  const elsewhere = temp(t);
  const exported = await run(elsewhere, "list", "--describing", "SLICE-ASMT-SCHEDULE", "--from", out, "--json");
  assert.equal(exported.code, 0, exported.err);
  const a = JSON.parse(tree.out);
  const b = JSON.parse(exported.out);
  assert.equal(b.source, "export");
  assert.deepEqual(b.counts, a.counts);
  assert.deepEqual(
    b.rows.map((row: { id: string }) => row.id),
    a.rows.map((row: { id: string }) => row.id),
  );
  assert.equal(b.rows[0].reviewedBy, "not-supplied");
  assert.equal(b.snapshot.graphHash, a.snapshot.graphHash);

  const level = await run(elsewhere, "list", "--from", out, "--level", "L2");
  assert.equal(level.code, 2);
  assert.match(level.err, /--level reads the tree/);
  writeFileSync(join(elsewhere, "bad.json"), '{"contract":"intentset/export/0.3"}');
  const bad = await run(elsewhere, "list", "--from", "bad.json");
  assert.equal(bad.code, 2);
  assert.match(bad.err, /unsupported-contract/);
});

test("BEH-LIST: a withheld link leaves a record undetermined, apart from the matches, unless restricted records are included", async (t) => {
  const dir = await example(t);
  edit(dir, "RULE-ASMT-AUTH", "visibility: internal", "visibility: restricted");
  const args = ["list", "--type", "behavior", "--has", "all:out:governedBy=draft"];
  const withheld = await run(dir, ...args);
  assert.equal(withheld.code, 0, withheld.err);
  assert.match(withheld.out, /Considered 14 \(1 withheld\), matched 0, undetermined 1/);
  assert.match(
    withheld.out,
    /Undetermined, because the answer depends on a link to a withheld artifact \(1\):\n {2}BEH-ASMT-SCHEDULE/,
  );
  const ids = await run(dir, ...args, "--format", "ids");
  assert.equal(ids.out, "");
  assert.match(ids.err, /1 record undetermined/);
  assert.equal((await run(dir, ...args, "--check")).code, 1, "--check never passes on an undetermined record");
  const included = await run(dir, ...args, "--include-restricted", "--format", "ids");
  assert.equal(included.out, "BEH-ASMT-SCHEDULE\n");
});

test("BEH-LIST: --check exits 1 when a record matches and 0 when none does", async (t) => {
  const dir = await example(t);
  assert.equal((await run(dir, "list", "--type", "rule", "--check")).code, 1);
  assert.equal((await run(dir, "list", "--type", "rule", "--status", "approved", "--check")).code, 0);
});

test("BEH-LIST: a failed validation still answers with exit 0, and says so", async (t) => {
  const dir = await example(t);
  edit(dir, "BEH-ASMT-SCHEDULE", "parent: CAP-ASMT-ASSIGN", "parent: CAP-ASMT-MISSING");
  const listed = await run(dir, "list", "--type", "behavior");
  assert.equal(listed.code, 0, listed.err);
  assert.match(listed.out, /Validation: fail at L1, 1 error/);
  assert.match(listed.out, /BEH-ASMT-SCHEDULE/);
  const ids = await run(dir, "list", "--type", "behavior", "--format", "ids");
  assert.match(ids.err, /validation failed at L1/);
});

test("BEH-LIST: an unknown option, a value outside a closed set or a malformed selector exits 2 before reading the tree", async (t) => {
  const dir = temp(t);
  const cases: Array<[string[], RegExp]> = [
    [["--status", "done"], /--status: done is not one of draft/],
    [["--type", ""], /--type: Each value is a nonempty string/],
    [["--id", "RULE-*-AUTH"], /--id: RULE-\*-AUTH: only a trailing \*/],
    [["--has", "governedBy"], /--has governedBy: write it as/],
    [["--has", "all:out:governedBy"], /--has: all needs a match/],
    [["--has", "sideways:governedBy"], /--has: direction is out/],
    [["--count-by", "colour"], /--count-by colour: the fields are/],
    [["--format", "csv"], /--format csv: the formats are table, json, ids/],
    [["--colour", "red"], /Unknown option '--colour'/],
  ];
  for (const [args, message] of cases) {
    const result = await run(dir, "list", ...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.err, message, args.join(" "));
  }
  writeFileSync(join(dir, "where.json"), JSON.stringify({ types: ["rule"], colour: ["red"] }));
  const where = await run(dir, "list", "--where", "where.json");
  assert.equal(where.code, 2);
  assert.match(where.err, /--where where.json: \/colour: colour is not a selector field/);
  const mixed = await run(dir, "list", "--where", "where.json", "--type", "rule");
  assert.match(mixed.err, /--where gives the whole selector; it does not combine with --type/);
});

test("BEH-LIST: --where reads the selector as JSON, the same selector the options compile to", async (t) => {
  const dir = await example(t);
  writeFileSync(
    join(dir, "where.json"),
    JSON.stringify({ links: [{ direction: "in", kind: "verifies", quantifier: "some" }], types: ["rule"] }),
  );
  const fromFile = await run(dir, "list", "--where", "where.json", "--json");
  const fromOptions = await run(dir, "list", "--type", "rule", "--has", "some:in:verifies", "--json");
  assert.equal(fromFile.code, 0, fromFile.err);
  assert.equal(fromFile.out, fromOptions.out);
});

test("BEH-LIST: list writes nothing", async (t) => {
  const dir = await example(t);
  const before = snapshot(dir);
  for (const args of [[], ["--json"], ["--format", "ids"], ["--count-by", "owner"], ["--check"]]) {
    await run(dir, "list", ...args);
  }
  assert.deepEqual(snapshot(dir), before);
});
