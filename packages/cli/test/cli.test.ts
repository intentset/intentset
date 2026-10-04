import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateSchema } from "../../conformance/src/schema.ts";
import { edit, example, exportSchema, git, RECORD, run, snapshot, temp } from "./helpers.ts";

test("init writes a config and empty registries, and validate passes on the empty scope", async (t) => {
  const dir = temp(t);
  const init = await run(dir, "init");
  assert.equal(init.code, 0, init.err);
  assert.match(init.out, /created \.intentset\/config\.yaml/);
  assert.match(init.out, /created \.intentset\/registries\.yaml/);
  assert.deepEqual(readdirSync(join(dir, ".intentset")).sort(), ["config.yaml", "registries.yaml"]);
  assert.match(readFileSync(join(dir, ".intentset", "config.yaml"), "utf8"), /- "product\/\*\*\/\*\.md"/);

  const validate = await run(dir, "validate");
  assert.equal(validate.code, 0, validate.out + validate.err);
  assert.equal(validate.out, "0 artifacts, 0 errors, 0 warnings (level L1, scope: product/**/*.md)\n");
});

test("init refuses to overwrite, and writes nothing when it refuses", async (t) => {
  const dir = temp(t);
  mkdirSync(join(dir, ".intentset"));
  writeFileSync(join(dir, ".intentset", "registries.yaml"), "owners: [mine]\n");
  const init = await run(dir, "init");
  assert.equal(init.code, 2);
  assert.match(init.err, /refusing to overwrite \.intentset\/registries\.yaml/);
  assert.equal(existsSync(join(dir, ".intentset", "config.yaml")), false);
  assert.equal(readFileSync(join(dir, ".intentset", "registries.yaml"), "utf8"), "owners: [mine]\n");

  const second = temp(t);
  assert.equal((await run(second, "init")).code, 0);
  const again = await run(second, "init");
  assert.equal(again.code, 2);
  assert.match(again.err, /config\.yaml, \.intentset\/registries\.yaml/);
});

test("init --example then validate: 13 artifacts and no diagnostics", async (t) => {
  const dir = await example(t);
  assert.equal(readdirSync(join(dir, "product", "scheduling")).length, 13);
  const validate = await run(dir, "validate");
  assert.equal(validate.code, 0, validate.out);
  assert.equal(validate.out, "13 artifacts, 0 errors, 0 warnings (level L1, scope: product/**/*.md)\n");
  assert.equal(validate.err, "");
});

test("a broken record exits 1 with its code, location, artifact, fix and field", async (t) => {
  const dir = await example(t);
  edit(dir, "BEH-ASMT-SCHEDULE", /- RULE-ASMT-AUTH$/m, "- RULE-ASMT-MISSING");
  const validate = await run(dir, "validate");
  assert.equal(validate.code, 1);
  assert.match(
    validate.out,
    /^product\/scheduling\/BEH-ASMT-SCHEDULE\.md:\d+ error CORE003 \[BEH-ASMT-SCHEDULE\] governedBy names RULE-ASMT-MISSING/m,
  );
  assert.match(validate.out, /^ {2}fix: .+$/m);
  assert.match(validate.out, /^ {2}field: \/intentset\/links\/governedBy\/1$/m);
  assert.match(validate.out, /13 artifacts, 1 error, 1 warning \(level L1, scope: product\/\*\*\/\*\.md\)\n$/);
});

test("Markset's own diagnostics are marked as Markset's in text and keep origin syntax in JSON", async (t) => {
  const dir = await example(t);
  writeFileSync(
    RECORD(dir, "RULE-ASMT-AUTH"),
    `${readFileSync(RECORD(dir, "RULE-ASMT-AUTH"), "utf8")}\n:::frob\nx\n:::\n`,
  );
  const text = await run(dir, "validate");
  assert.equal(text.code, 1);
  assert.match(text.out, /^markset: product\/scheduling\/RULE-ASMT-AUTH\.md:\d+:\d+ error DIRECTIVE_UNKNOWN_NAME /m);
  const report = JSON.parse((await run(dir, "validate", "--json")).out);
  assert.deepEqual(
    report.diagnostics.map((d: { code: string; origin: string }) => [d.code, d.origin]),
    [["DIRECTIVE_UNKNOWN_NAME", "syntax"]],
  );
  const plain = await run(dir, "validate", "--carrier", "plain");
  assert.equal(plain.code, 0, "the plain carrier has no grammar to fail");
});

test("no configuration anywhere above exits 2 and names init", async (t) => {
  const dir = temp(t);
  const validate = await run(dir, "validate");
  assert.equal(validate.code, 2);
  assert.match(validate.err, /no \.intentset\/config\.yaml/);
  assert.match(validate.err, /intentset init/);
  assert.equal(validate.out, "");
  assert.equal((await run(dir, "impact", "BEH-ASMT-SCHEDULE")).code, 2);
});

test("the root is found from a subdirectory, and --root names it from anywhere", async (t) => {
  const dir = await example(t);
  const nested = await run(join(dir, "product", "scheduling"), "validate");
  assert.equal(nested.code, 0);
  assert.match(nested.out, /^13 artifacts/);
  const elsewhere = await run(tmpdir(), "validate", "--root", dir);
  assert.equal(elsewhere.out, nested.out);
});

test("a configuration with errors exits 2 with its CFG001", async (t) => {
  const dir = await example(t);
  writeFileSync(join(dir, ".intentset", "config.yaml"), 'scope:\n  - "**/*.md"\n');
  const validate = await run(dir, "validate");
  assert.equal(validate.code, 2);
  assert.match(validate.err, /^\.intentset\/config\.yaml error CFG001 `repository` is required/m);
});

test("an unknown command exits 2 with the usage, and every command is built", async (t) => {
  const dir = await example(t);
  const unknown = await run(dir, "valdiate");
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /unknown command "valdiate"/);
  assert.match(unknown.err, /usage: intentset <command>/);
  assert.doesNotMatch(unknown.err, /not built yet/);
  const help = await run(dir, "--help");
  assert.equal(help.code, 0);
  assert.match(help.out, /usage: intentset/);
  assert.equal((await run(dir)).code, 2);
});

test("invocation errors exit 2 before reading anything", async (t) => {
  const dir = await example(t);
  const cases: [string[], RegExp][] = [
    [["validate", "--bogus"], /Unknown option '--bogus'/],
    [["validate", "--out", "x.json"], /--out is not an option of validate/],
    [["validate", "--carrier", "html"], /the carriers are markset and plain/],
    [["validate", "--level", "L9"], /the levels are L1, L2, L3, L4, L5/],
    [["validate", "--level", "L5"], /L5 is a claim about continuous CI, not something one run can check/],
    [["validate", "--product", "PRD-LANTERN"], /give both or neither/],
    [["validate", "--level", "L2", "--mode", "lax"], /the modes are migration and strict/],
    [["architecture"], /the only subcommand is "architecture check"/],
    [["architecture", "check", "--level", "L1"], /runs at L2 and above/],
    [["evidence", "import", "r.json", "--from", "jest"], /the reporters are vitest and node-tap/],
    [["evidence", "import", "--from", "vitest"], /a report file is required/],
    [
      ["evidence", "import", "r.json", "--from", "vitest", "--product", "PRD-LANTERN", "--release", "pilot-1"],
      /--out is required/,
    ],
    [["publish", "--visibility", "customer"], /--out <dir> is required/],
    [["review", "extra"], /unexpected argument "extra"/],
    [["validate", "extra"], /unexpected argument "extra"/],
    [["impact"], /an artifact ID is required/],
    [["graph", "--format", "yaml"], /the only format is json/],
    [["graph", "--release", "pilot-1"], /<product ID>:<label>/],
  ];
  for (const [argv, message] of cases) {
    const result = await run(dir, ...argv);
    assert.equal(result.code, 2, argv.join(" "));
    assert.match(result.err, message, argv.join(" "));
  }
});

test("validate --json parses, counts warnings apart from errors, and is the same bytes twice", async (t) => {
  const dir = await example(t);
  edit(dir, "BEH-ASMT-SCHEDULE", /- RULE-ASMT-AUTH$/m, "- RULE-ASMT-MISSING");
  const first = await run(dir, "validate", "--json");
  const second = await run(dir, "validate", "--json");
  assert.equal(first.code, 1);
  assert.equal(first.out, second.out);
  const report = JSON.parse(first.out);
  assert.deepEqual(Object.keys(report), [...Object.keys(report)].sort(), "canonical key order");
  assert.deepEqual(report.tool.name, "intentset");
  assert.equal(report.level, "L1");
  assert.deepEqual(report.scope, ["product/**/*.md"]);
  assert.equal(report.commit, null);
  assert.match(report.commitUnavailable, /not inside a git repository/);
  assert.match(report.graphHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(report.summary, { artifacts: 13, documents: 13, errors: 1, warnings: 1 });
  assert.deepEqual(
    report.diagnostics.map((d: { code: string; severity: string }) => [d.code, d.severity]),
    [
      ["CORE003", "error"],
      ["CORE009", "warning"],
    ],
  );
  assert.ok(first.out.startsWith('{\n  "commit"'), "two-space indent");
});

test("--carrier plain and markset give identical validate output on the example", async (t) => {
  const dir = await example(t);
  for (const format of [[], ["--json"]]) {
    const markset = await run(dir, "validate", ...format);
    const plain = await run(dir, "validate", "--carrier", "plain", ...format);
    assert.equal(plain.out, markset.out);
    assert.equal(plain.code, markset.code);
  }
});

test("graph prints an envelope that matches spec/export.schema.json", async (t) => {
  const dir = await example(t);
  const graph = await run(dir, "graph", "--format", "json");
  assert.equal(graph.code, 0, graph.err);
  const envelope = JSON.parse(graph.out);
  assert.deepEqual(validateSchema(exportSchema, envelope), []);
  assert.equal(envelope.repository, "example/lantern");
  assert.equal(envelope.artifacts.length, 13);
  assert.deepEqual(envelope.validation.scope, ["product/**/*.md"]);
  assert.equal(envelope.validation.status, "pass");
  assert.equal(envelope.source.commit, null);
  assert.ok(envelope.artifacts.every((a: { body?: string }) => a.body === undefined));

  const full = await run(
    dir,
    "graph",
    "--include-bodies",
    "--release",
    "PRD-LANTERN:pilot-1",
    "--generated-at",
    "2026-10-02T12:00:00Z",
  );
  const withBodies = JSON.parse(full.out);
  assert.deepEqual(validateSchema(exportSchema, withBodies), []);
  assert.deepEqual(withBodies.release, { product: "PRD-LANTERN", label: "pilot-1" });
  assert.ok(withBodies.artifacts.every((a: { body?: string }) => typeof a.body === "string"));
  const again = await run(
    dir,
    "graph",
    "--include-bodies",
    "--release",
    "PRD-LANTERN:pilot-1",
    "--generated-at",
    "2026-10-02T12:00:00Z",
  );
  assert.equal(again.out, full.out, "a fixed generatedAt makes the export the same bytes");

  const unknownProduct = await run(dir, "graph", "--release", "PRD-NOPE:pilot-1");
  assert.equal(unknownProduct.code, 2);
});

test("graph on a failing repository still exports, marked fail, and exits 1", async (t) => {
  const dir = await example(t);
  edit(dir, "BEH-ASMT-SCHEDULE", /- RULE-ASMT-AUTH$/m, "- RULE-ASMT-MISSING");
  const graph = await run(dir, "graph");
  assert.equal(graph.code, 1);
  const envelope = JSON.parse(graph.out);
  assert.deepEqual(validateSchema(exportSchema, envelope), []);
  assert.equal(envelope.validation.status, "fail");
  assert.equal(envelope.validation.errors, 1);
});

test("graph --out writes that one file and refuses to write over a file the repository reads", async (t) => {
  const dir = await example(t);
  const before = snapshot(dir);
  const out = await run(dir, "graph", "--out", "export.json");
  assert.equal(out.code, 0, out.err);
  assert.equal(out.out, "");
  const after = snapshot(dir);
  assert.deepEqual(
    [...after.keys()].filter((path) => !before.has(path)),
    [join(dir, "export.json")],
  );
  assert.deepEqual(validateSchema(exportSchema, JSON.parse(readFileSync(join(dir, "export.json"), "utf8"))), []);

  const record = RECORD(dir, "PRD-LANTERN");
  const bytes = readFileSync(record, "utf8");
  const refused = await run(dir, "graph", "--out", record);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /is a file the repository reads; tools never rewrite those/);
  assert.equal(readFileSync(record, "utf8"), bytes);
});

test("impact BEH-ASMT-SCHEDULE lists the slice, the verification and the knowledge, with snapshot and caveat", async (t) => {
  const dir = await example(t);
  const impact = await run(dir, "impact", "BEH-ASMT-SCHEDULE");
  assert.equal(impact.code, 0, impact.err);
  const lines = impact.out.split("\n");
  assert.equal(lines[0], 'Impact of BEH-ASMT-SCHEDULE, behavior "Schedule an assessment"');
  assert.match(lines[1], /^Snapshot: no commit \(.+\), graph [0-9a-f]{64}$/);
  assert.match(impact.out, /not proof that runtime behavior changed/);
  const direct = impact.out.slice(impact.out.indexOf("Direct"), impact.out.indexOf("Candidates"));
  for (const id of ["SLICE-ASMT-SCHEDULE", "TEST-ASMT-SCHEDULE", "KB-ASMT-SCHEDULE", "SCN-ASMT-SCHEDULE"]) {
    assert.match(direct, new RegExp(`^ {2}${id} `, "m"));
  }
  assert.match(direct, /path: SLICE-ASMT-SCHEDULE --implements--> BEH-ASMT-SCHEDULE/);
  assert.match(direct, /reason: TEST-ASMT-SCHEDULE verifies BEH-ASMT-SCHEDULE\./);
  assert.match(impact.out, /Review context \(2\)/);
  assert.match(impact.out, /path: BEH-ASMT-SCHEDULE --governedBy--> RULE-ASMT-FUTURE/);
  assert.match(impact.out, /^Ancestors: CAP-ASMT-ASSIGN > OUT-PREPARE > INT-PREPARE > PRD-LANTERN$/m);

  const report = JSON.parse((await run(dir, "impact", "BEH-ASMT-SCHEDULE", "--json")).out);
  assert.deepEqual(
    report.direct.map((hit: { id: string }) => hit.id),
    ["KB-ASMT-SCHEDULE", "SCN-ASMT-SCHEDULE", "SLICE-ASMT-SCHEDULE", "TEST-ASMT-SCHEDULE"],
  );
  assert.match(report.snapshot.graphHash, /^[0-9a-f]{64}$/);
});

test("impact of a rule reaches downstream candidates with multi-step paths", async (t) => {
  const dir = await example(t);
  const impact = await run(dir, "impact", "RULE-ASMT-FUTURE");
  assert.equal(impact.code, 0);
  const candidates = impact.out.slice(impact.out.indexOf("Candidates"), impact.out.indexOf("Review context"));
  assert.match(candidates, /SLICE-ASMT-SCHEDULE --implements--> BEH-ASMT-SCHEDULE --governedBy--> RULE-ASMT-FUTURE/);
});

test("impact and context of an unknown ID exit 1 with a CORE003", async (t) => {
  const dir = await example(t);
  for (const command of ["impact", "context"]) {
    const result = await run(dir, command, "BEH-NOPE");
    assert.equal(result.code, 1, command);
    assert.match(result.err, /error CORE003 BEH-NOPE does not resolve to an artifact in this graph/);
    const json = JSON.parse((await run(dir, command, "BEH-NOPE", "--json")).out);
    assert.equal(json.diagnostics[0].code, "CORE003");
  }
});

test("context BEH-ASMT-SCHEDULE holds the owning slice, both rules and the rest, each with its path", async (t) => {
  const dir = await example(t);
  const context = await run(dir, "context", "BEH-ASMT-SCHEDULE");
  assert.equal(context.code, 0, context.err);
  assert.match(context.out, /^# Context for BEH-ASMT-SCHEDULE$/m);
  assert.match(context.out, /Snapshot: no commit \(.+\), graph [0-9a-f]{64}/);
  for (const id of [
    "SLICE-ASMT-SCHEDULE",
    "BEH-ASMT-SCHEDULE",
    "RULE-ASMT-AUTH",
    "RULE-ASMT-FUTURE",
    "SCN-ASMT-SCHEDULE",
    "CONTRACT-ASMT-SCHEDULE",
    "ADR-ASMT-SEAM",
    "TEST-ASMT-SCHEDULE",
    "KB-ASMT-SCHEDULE",
    "CAP-ASMT-ASSIGN",
  ]) {
    assert.match(context.out, new RegExp(`^### ${id}: `, "m"), id);
    assert.match(context.out, new RegExp(`^- Path: product/scheduling/${id}\\.md$`, "m"), id);
  }
  assert.match(context.out, /The authoritative server time must be earlier/, "bodies are included");
  const order = [
    "## Start",
    "## Owning slice",
    "## Rules",
    "## Scenarios",
    "## Verification definitions",
    "## Knowledge",
  ];
  const at = order.map((heading) => context.out.indexOf(`\n${heading}\n`));
  assert.ok(
    at.every((i, n) => i > 0 && (n === 0 || i > at[n - 1])),
    `sections in role order: ${at.join(", ")}`,
  );
  assert.match(context.out, /Included: 13 artifacts\. Withheld: 0 restricted\./);
});

test("context from a rule, a slice and a capability reaches the same slice; other types get their neighbours", async (t) => {
  const dir = await example(t);
  for (const id of ["RULE-ASMT-AUTH", "SLICE-ASMT-SCHEDULE", "CAP-ASMT-ASSIGN"]) {
    const context = JSON.parse((await run(dir, "context", id, "--json")).out);
    const ids = context.artifacts.map((a: { id: string }) => a.id);
    assert.ok(ids.includes("SLICE-ASMT-SCHEDULE"), id);
    assert.ok(ids.includes("BEH-ASMT-SCHEDULE"), id);
    assert.equal(context.artifacts[0].id, id, `${id} comes first, as the start`);
    assert.equal(context.artifacts[0].role, "start");
  }
  const knowledge = JSON.parse((await run(dir, "context", "KB-ASMT-SCHEDULE", "--json")).out);
  assert.deepEqual(
    knowledge.artifacts.filter((a: { role: string }) => a.role === "neighbour").map((a: { id: string }) => a.id),
    ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"],
  );
});

test("context withholds restricted artifacts unless asked, and says how many", async (t) => {
  const dir = await example(t);
  edit(dir, "RULE-ASMT-AUTH", "visibility: internal", "visibility: restricted");
  const withheld = await run(dir, "context", "BEH-ASMT-SCHEDULE");
  assert.equal(withheld.code, 0);
  assert.match(withheld.out, /Included: 12 artifacts\. Withheld: 1 restricted; pass --include-restricted/);
  assert.doesNotMatch(withheld.out, /RULE-ASMT-AUTH|Require assignment permission/);
  const json = JSON.parse((await run(dir, "context", "BEH-ASMT-SCHEDULE", "--json")).out);
  assert.equal(json.withheld, 1);
  assert.equal(json.included, 12);

  const included = await run(dir, "context", "BEH-ASMT-SCHEDULE", "--include-restricted");
  assert.match(included.out, /^### RULE-ASMT-AUTH: Require assignment permission$/m);
  assert.match(included.out, /Restricted artifacts are included, as asked\./);
});

test("validate, graph, architecture check, impact and context change no file's bytes or modification time, and create none", async (t) => {
  const dir = await example(t);
  edit(dir, "BEH-ASMT-SCHEDULE", /- RULE-ASMT-AUTH$/m, "- RULE-ASMT-MISSING");
  const before = snapshot(dir);
  await new Promise((done) => setTimeout(done, 20));
  for (const argv of [
    ["validate"],
    ["validate", "--json"],
    ["graph"],
    ["impact", "BEH-ASMT-SCHEDULE"],
    ["impact", "BEH-ASMT-SCHEDULE", "--json"],
    ["context", "BEH-ASMT-SCHEDULE"],
    ["architecture", "check"],
    ["validate", "--level", "L4"],
  ]) {
    await run(dir, ...argv);
  }
  assert.deepEqual(snapshot(dir), before);
});

test("in a git repository the commit is read, and an empty repository says why there is none", async (t) => {
  const dir = await example(t);
  git(dir, "init", "-q");
  const unborn = JSON.parse((await run(dir, "validate", "--json")).out);
  assert.equal(unborn.commit, null);
  assert.match(unborn.commitUnavailable, /no commit/);

  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "example");
  const head = git(dir, "rev-parse", "HEAD");
  const before = snapshot(dir);
  const report = JSON.parse((await run(dir, "validate", "--json")).out);
  assert.equal(report.commit, head);
  assert.equal(report.commitUnavailable, undefined);
  const envelope = JSON.parse((await run(dir, "graph")).out);
  assert.deepEqual(envelope.source, { commit: head, uncommitted: false });
  assert.deepEqual(validateSchema(exportSchema, envelope), []);
  assert.match(
    (await run(dir, "impact", "BEH-ASMT-SCHEDULE")).out,
    new RegExp(`^Snapshot: commit ${head}, graph `, "m"),
  );
  assert.deepEqual(snapshot(dir), before, "reading the commit writes nothing, inside .git included");
});
