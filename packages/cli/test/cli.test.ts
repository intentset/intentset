import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { TypeScriptMissingError } from "@intentset/architecture";
import { validateSchema } from "../../conformance/src/harness.ts";
import { typescriptMissing } from "../src/commands/shared.ts";
import { asEarlier, atEarlier, edit, example, exportSchema, git, RECORD, run, snapshot, temp } from "./helpers.ts";

test("BEH-AGENT-GUIDE: init writes a config and empty registries, and validate passes on the empty scope", async (t) => {
  const dir = temp(t);
  const init = await run(dir, "init");
  assert.equal(init.code, 0, init.err);
  assert.match(init.out, /created \.intentset\/config\.yaml/);
  assert.match(init.out, /created \.intentset\/registries\.yaml/);
  assert.match(init.out, /created \.intentset\/agents\.md/);
  assert.deepEqual(readdirSync(join(dir, ".intentset")).sort(), ["agents.md", "config.yaml", "registries.yaml"]);
  assert.match(init.out, /CLAUDE\.md: @\.intentset\/agents\.md/);
  assert.match(init.out, /AGENTS\.md: Before changing code, read \.intentset\/agents\.md and follow it\./);
  assert.match(readFileSync(join(dir, ".intentset", "config.yaml"), "utf8"), /- "product\/\*\*\/\*\.md"/);

  const validate = await run(dir, "validate");
  assert.equal(validate.code, 0, validate.out + validate.err);
  assert.equal(validate.out, "0 artifacts, 0 errors, 0 warnings (level L1, scope: product/**/*.md)\n");
});

test("BEH-AGENT-GUIDE: init refuses to overwrite, and writes nothing when it refuses", async (t) => {
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

test("BEH-AGENT-GUIDE: init --agents writes only the guide, for the scope the config names, and never over an existing one", async (t) => {
  const dir = temp(t);
  mkdirSync(join(dir, ".intentset"));
  writeFileSync(
    join(dir, ".intentset", "config.yaml"),
    'repository: "acme/app"\nscope:\n  - "docs/model/**/*.md"\nregistries: null\nignore: []\n',
  );
  const init = await run(dir, "init", "--agents");
  assert.equal(init.code, 0, init.err);
  assert.deepEqual(readdirSync(join(dir, ".intentset")).sort(), ["agents.md", "config.yaml"]);
  const guide = readFileSync(join(dir, ".intentset", "agents.md"), "utf8");
  assert.match(guide, /under `docs\/model\/\*\*\/\*\.md`/);
  assert.match(guide, /^Intentset-Unchanged: SLICE-\.\.\.$/m);
  assert.match(guide, /^\| behavior \| ## Behavior, ## Preconditions, ## Outcomes \|$/m);

  const again = await run(dir, "init", "--agents");
  assert.equal(again.code, 2);
  assert.match(again.err, /refusing to overwrite \.intentset\/agents\.md/);
  assert.equal((await run(dir, "init", "--agents", "--example")).code, 2);
});

test("BEH-AGENT-GUIDE: guide prints the guide init --agents writes, for the config's scope, and writes nothing", async (t) => {
  const dir = temp(t);
  mkdirSync(join(dir, ".intentset"));
  writeFileSync(
    join(dir, ".intentset", "config.yaml"),
    'repository: "acme/app"\nscope:\n  - "docs/model/**/*.md"\nregistries: null\nignore: []\n',
  );
  mkdirSync(join(dir, "src"));
  const printed = await run(join(dir, "src"), "guide");
  assert.equal(printed.code, 0, printed.err);
  assert.equal(printed.err, "");
  assert.deepEqual(readdirSync(join(dir, ".intentset")), ["config.yaml"], "guide writes nothing");
  assert.match(printed.out, /under `docs\/model\/\*\*\/\*\.md`/);

  assert.equal((await run(dir, "init", "--agents")).code, 0);
  assert.equal(printed.out, readFileSync(join(dir, ".intentset", "agents.md"), "utf8"), "the same text init writes");

  // With no configuration anywhere above it, init's default scope.
  const bare = await run(temp(t), "guide");
  assert.equal(bare.code, 0, bare.err);
  assert.match(bare.out, /under `product\/\*\*\/\*\.md`/);
  assert.equal((await run(dir, "guide", "extra")).code, 2);
});

test("the guide says records are Markset documents, and where Markset's own guide is", async (t) => {
  const npm = (await run(temp(t), "guide")).out;
  assert.match(npm, /A record is a Markset document/);
  assert.ok(npm.includes("https://markset.org/guide.md"), "the guide names Markset's guide");
  assert.ok(npm.includes("`npx @markset-lang/cli guide`"));
  assert.match(npm, /`npx intentset guide` prints it without writing a file/);
  const pnpm = temp(t);
  writeFileSync(join(pnpm, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  assert.ok((await run(pnpm, "guide")).out.includes("`pnpm dlx @markset-lang/cli guide`"));
});

test("the guide runs the CLI through the package manager the repository uses", async (t) => {
  const npm = temp(t);
  assert.equal((await run(npm, "init")).code, 0);
  const npmGuide = readFileSync(join(npm, ".intentset", "agents.md"), "utf8");
  assert.match(npmGuide, /^npx intentset validate$/m);
  assert.match(npmGuide, /npx -p @intentset\/cli -p typescript@7 intentset/);

  const pnpm = temp(t);
  writeFileSync(join(pnpm, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  assert.equal((await run(pnpm, "init")).code, 0);
  const pnpmGuide = readFileSync(join(pnpm, ".intentset", "agents.md"), "utf8");
  assert.match(pnpmGuide, /^pnpm exec intentset validate$/m);
  assert.match(pnpmGuide, /pnpm dlx --package=@intentset\/cli --package=typescript@7 intentset/);
  assert.doesNotMatch(pnpmGuide, /\bnpx\b/);

  const declared = temp(t);
  writeFileSync(join(declared, "package.json"), JSON.stringify({ packageManager: "pnpm@11.24.0" }));
  assert.equal((await run(declared, "init", "--agents")).code, 0);
  assert.match(readFileSync(join(declared, ".intentset", "agents.md"), "utf8"), /pnpm exec intentset init --agents/);
});

test("the guide's behavior template validates once its placeholders name real values", async (t) => {
  const dir = await example(t);
  const guide = readFileSync(join(dir, ".intentset", "agents.md"), "utf8");
  const template = /```markdown\n([\s\S]*?)```/.exec(guide)?.[1] ?? "";
  const record = template
    .replace("BEH-AREA-NAME", "BEH-ASMT-NEW")
    .replace("<an owner from the registry>", "team-assessment")
    .replace("CAP-...", "CAP-ASMT-ASSIGN")
    .replace("RULE-...", "RULE-ASMT-FUTURE")
    .replace("PRD-...", "PRD-LANTERN")
    .replace("<a release from the registry>", "pilot-1")
    .replace("<a role>", "teacher")
    .replace("<an edition>", "standard");
  assert.doesNotMatch(record, /\.\.\.|<[a-z]/, "every placeholder was replaced");
  writeFileSync(join(dir, "product", "scheduling", "BEH-ASMT-NEW.md"), record);
  const validate = await run(dir, "validate");
  assert.equal(validate.code, 0, validate.out + validate.err);
  assert.match(validate.out, /^16 artifacts, 0 errors/);
});

test("init --example then validate: 15 artifacts and no diagnostics", async (t) => {
  const dir = await example(t);
  assert.equal(readdirSync(join(dir, "product", "scheduling")).length, 15);
  const validate = await run(dir, "validate");
  assert.equal(validate.code, 0, validate.out);
  assert.equal(validate.out, "15 artifacts, 0 errors, 0 warnings (level L1, scope: product/**/*.md)\n");
  assert.equal(validate.err, "");
});

test("BEH-VALIDATE-REPORTS: a broken record exits 1 with its code, location, artifact, fix and field", async (t) => {
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
  assert.match(validate.out, /15 artifacts, 1 error, 1 warning \(level L1, scope: product\/\*\*\/\*\.md\)\n$/);
});

test("BEH-MARKSET-CARRIER: Markset's own diagnostics are marked as Markset's in text and keep origin syntax in JSON", async (t) => {
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

test("BEH-VALIDATE-REPORTS: no configuration anywhere above exits 2 and names init", async (t) => {
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
  assert.match(nested.out, /^15 artifacts/);
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

test("--version prints the tool and its version, the one a report names, and exits 0", async (t) => {
  const dir = temp(t);
  const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
    version: string;
  };
  for (const argv of [["--version"], ["validate", "--version"], ["--version", "--json"]]) {
    const result = await run(dir, ...argv);
    assert.equal(result.code, 0, argv.join(" "));
    assert.equal(result.out, `intentset ${version}\n`, argv.join(" "));
    assert.equal(result.err, "", argv.join(" "));
  }
  // Asked for both, help answers: it already names --version.
  const both = await run(dir, "--version", "--help");
  assert.equal(both.code, 0);
  assert.match(both.out, /usage: intentset/);
  assert.match(both.out, /--version/);
});

test("BEH-VALIDATE-REPORTS: invocation errors exit 2 before reading anything", async (t) => {
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
    [["evidence", "import", "r.json", "--from", "jest"], /the reporters are vitest, playwright, node-tap/],
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

test("BEH-VALIDATE-REPORTS: validate --json parses, counts warnings apart from errors, and is the same bytes twice", async (t) => {
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
  assert.deepEqual(report.summary, { artifacts: 15, documents: 15, errors: 1, warnings: 1 });
  assert.deepEqual(
    report.diagnostics.map((d: { code: string; severity: string }) => [d.code, d.severity]),
    [
      ["CORE003", "error"],
      ["CORE009", "warning"],
    ],
  );
  assert.ok(first.out.startsWith('{\n  "commit"'), "two-space indent");
});

test("BEH-MARKSET-CARRIER: --carrier plain and markset give identical validate output on the example", async (t) => {
  const dir = await example(t);
  for (const format of [[], ["--json"]]) {
    const markset = await run(dir, "validate", ...format);
    const plain = await run(dir, "validate", "--carrier", "plain", ...format);
    assert.equal(plain.out, markset.out);
    assert.equal(plain.code, markset.code);
  }
});

test("BEH-EXPORT: graph prints an envelope that matches spec/export.schema.json", async (t) => {
  const dir = await example(t);
  const graph = await run(dir, "graph", "--format", "json");
  assert.equal(graph.code, 0, graph.err);
  const envelope = JSON.parse(graph.out);
  assert.deepEqual(validateSchema(exportSchema, envelope), []);
  assert.equal(envelope.repository, "example/lantern");
  assert.equal(envelope.artifacts.length, 15);
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

test("BEH-EXPORT: graph on a failing repository still exports, marked fail, and exits 1", async (t) => {
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

test("BEH-IMPACT: impact BEH-ASMT-SCHEDULE lists the slice, the verification and the knowledge, with snapshot and caveat", async (t) => {
  const dir = await example(t);
  const impact = await run(dir, "impact", "BEH-ASMT-SCHEDULE");
  assert.equal(impact.code, 0, impact.err);
  const lines = impact.out.split("\n");
  assert.equal(lines[0], 'Impact of BEH-ASMT-SCHEDULE, behavior "Schedule a student assessment"');
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

test("BEH-IMPACT: impact of a rule reaches downstream candidates with multi-step paths", async (t) => {
  const dir = await example(t);
  const impact = await run(dir, "impact", "RULE-ASMT-FUTURE");
  assert.equal(impact.code, 0);
  const candidates = impact.out.slice(impact.out.indexOf("Candidates"), impact.out.indexOf("Review context"));
  assert.match(candidates, /SLICE-ASMT-SCHEDULE --implements--> BEH-ASMT-SCHEDULE --governedBy--> RULE-ASMT-FUTURE/);
});

test("BEH-IMPACT, BEH-CONTEXT: impact and context of an unknown ID exit 1 with a CORE003", async (t) => {
  const dir = await example(t);
  for (const command of ["impact", "context"]) {
    const result = await run(dir, command, "BEH-NOPE");
    assert.equal(result.code, 1, command);
    assert.match(result.err, /error CORE003 BEH-NOPE does not resolve to an artifact in this graph/);
    const json = JSON.parse((await run(dir, command, "BEH-NOPE", "--json")).out);
    assert.equal(json.diagnostics[0].code, "CORE003");
  }
});

test("BEH-CONTEXT: context BEH-ASMT-SCHEDULE holds the owning slice, both rules and the rest, each with its path", async (t) => {
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

test("BEH-CONTEXT: context from a rule, a slice and a capability reaches the same slice; other types get their neighbours", async (t) => {
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

test("BEH-CONTEXT: context carries the basis of a record's approval and the outside requirement it formalizes", async (t) => {
  const dir = await example(t);
  const plain = JSON.parse((await run(dir, "context", "BEH-ASMT-SCHEDULE", "--json")).out);
  for (const a of plain.artifacts) {
    assert.equal(a.approval, null, `${a.id} states no approval`);
    assert.deepEqual(a.formalizes, [], `${a.id} formalizes nothing`);
  }
  edit(
    dir,
    "BEH-ASMT-SCHEDULE",
    "  status: draft\n",
    "  status: draft\n  approval:\n    by: ana.reyes\n    at: '2026-11-14'\n    basis: derived\n    source:\n      ref: https://tracker.example/LAN-12\n      revision: '7'\n    attestedBy: drafting-agent\n  formalizes:\n    - source: https://tracker.example/LAN-12\n      anchor: criterion-3\n    - source: https://tracker.example/LAN-12\n",
  );
  const result = await run(dir, "context", "BEH-ASMT-SCHEDULE", "--json");
  assert.equal(result.code, 0, result.err);
  const start = JSON.parse(result.out).artifacts[0];
  assert.deepEqual(start.approval, {
    by: "ana.reyes",
    at: "2026-11-14",
    basis: "derived",
    source: { ref: "https://tracker.example/LAN-12", revision: "7", digest: null },
    attestedBy: "drafting-agent",
  });
  assert.deepEqual(start.formalizes, [
    { source: "https://tracker.example/LAN-12", anchor: null },
    { source: "https://tracker.example/LAN-12", anchor: "criterion-3" },
  ]);
  assert.equal(start.contentHash, plain.artifacts[0].contentHash, "neither field is in the content hash");
  assert.notEqual(start.sourceHash, plain.artifacts[0].sourceHash);

  const text = (await run(dir, "context", "BEH-ASMT-SCHEDULE")).out;
  assert.match(
    text,
    /^- Approval: derived, from https:\/\/tracker\.example\/LAN-12 at revision 7, by ana\.reyes, attested by drafting-agent, at 2026-11-14$/m,
  );
  assert.match(
    text,
    /^- Formalizes: https:\/\/tracker\.example\/LAN-12; https:\/\/tracker\.example\/LAN-12 \(criterion-3\)$/m,
  );
  assert.equal(text.match(/^- Approval: /gm)?.length, 1, "a record that states none shows no line");
});

test("BEH-CONTEXT: context withholds restricted artifacts unless asked, and says how many", async (t) => {
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

for (const version of ["0.2", "0.1"]) {
  test(`BEH-MIGRATE: migrate --to 0.3 rewrites spec and profile from ${version} in every record, moves the knowledge's review, and says how many`, async (t) => {
    const { dir, files, current } = await atEarlier(t, version);
    const before = await run(dir, "validate");
    assert.equal(before.code, 1, `a reader of 0.3 rejects the records at ${version}`);
    assert.match(before.out, /migrate --to 0\.3/, "and says how to move them");

    const moved = await run(dir, "migrate", "--to", "0.3");
    assert.equal(moved.code, 0, moved.err);
    assert.match(moved.out, new RegExp(`moved ${files.length} records to 0\\.3`));
    for (const name of files) {
      assert.equal(readFileSync(join(dir, "product", "scheduling", name), "utf8"), current.get(name), name);
    }
    const numstat = git(dir, "diff", "--numstat").split("\n");
    assert.equal(numstat.length, files.length);
    assert.ok(
      numstat.filter((line) => !line.endsWith("KB-ASMT-SCHEDULE.md")).every((line) => line.startsWith("2\t2\t")),
      "each record but the knowledge changed by exactly two lines",
    );
    // ADR 0025: the knowledge's review leaves `extensions` for `review`, one level up, and `extensions` goes with it.
    assert.ok(
      numstat.some((line) => line.startsWith("8\t9\t") && line.endsWith("KB-ASMT-SCHEDULE.md")),
      numstat.join("; "),
    );
    assert.equal((await run(dir, "validate")).code, 0);

    git(dir, "commit", "-q", "-am", "migrated");
    const again = await run(dir, "migrate", "--to", "0.3");
    assert.equal(again.code, 0);
    assert.match(again.out, new RegExp(`moved 0 records to 0\\.3; ${files.length} already 0\\.3`));
  });
}

test("BEH-MIGRATE: migrate keeps comments, quoting and line endings, and leaves a record at another version alone", async (t) => {
  const { dir } = await atEarlier(t);
  const path = join(dir, "product", "scheduling", "OUT-PREPARE.md");
  const text = readFileSync(path, "utf8").replace("spec: '0.2'", 'spec: "0.2" # the version').replace(/\n/g, "\r\n");
  writeFileSync(path, text);
  const other = join(dir, "product", "scheduling", "INT-PREPARE.md");
  writeFileSync(other, readFileSync(other, "utf8").replace("spec: '0.2'", "spec: '0.9'"));
  git(dir, "commit", "-q", "-am", "one with a comment and CRLF, one at 0.9");
  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 0, moved.err);
  assert.match(moved.out, /1 declare neither/);
  const after = readFileSync(path, "utf8");
  assert.match(after, /spec: "0\.3" # the version\r\n/);
  assert.match(after, /profile: intentset\/outcome\/0\.3\r\n/);
  assert.equal(after.replace("0.3", "0.2").replace("outcome/0.3", "outcome/0.2"), text);
  assert.match(readFileSync(other, "utf8"), /spec: '0\.9'/);
});

for (const version of ["0.2", "0.1"]) {
  test(`BEH-MIGRATE: migrate --to 0.3 from ${version} rewrites implemented and released to approved, with delivery built where the type carries it and states none`, async (t) => {
    const { dir } = await atEarlier(t, version);
    const set = (id: string, status: string) => edit(dir, id, "status: draft", `status: ${status}`);
    // Types that carry delivery: a capability, a behavior and a slice that state none, and a rule that states one.
    set("CAP-ASMT-ASSIGN", "implemented");
    set("BEH-ASMT-SCHEDULE", "released");
    set("SLICE-ASMT-SCHEDULE", "'implemented' # shipped");
    edit(dir, "RULE-ASMT-AUTH", "status: draft", "status: released\n  delivery: planned");
    // Types that never carry delivery, and a deprecated record, which keeps its inference.
    set("OUT-PREPARE", "released");
    set("INT-PREPARE", "implemented");
    set("ADR-ASMT-SEAM", "implemented");
    set("RULE-ASMT-FUTURE", "deprecated");
    git(dir, "commit", "-q", "-am", "statuses an earlier version listed");
    const before = new Map(
      [
        "CAP-ASMT-ASSIGN",
        "BEH-ASMT-SCHEDULE",
        "SLICE-ASMT-SCHEDULE",
        "RULE-ASMT-AUTH",
        "OUT-PREPARE",
        "RULE-ASMT-FUTURE",
      ].map((id) => [id, readFileSync(RECORD(dir, id), "utf8")]),
    );

    const moved = await run(dir, "migrate", "--to", "0.3");
    assert.equal(moved.code, 0, moved.err);
    const after = (id: string) => readFileSync(RECORD(dir, id), "utf8");
    const moveOnly = (text: string) =>
      text.replace(`spec: '${version}'`, "spec: '0.3'").replace(/(profile: intentset\/[a-z]+\/)\d\.\d/, "$10.3");
    for (const id of ["CAP-ASMT-ASSIGN", "BEH-ASMT-SCHEDULE"]) {
      const status = before.get(id)?.match(/status: (\w+)/)?.[1] ?? "";
      assert.equal(
        after(id),
        moveOnly(before.get(id) ?? "").replace(`status: ${status}`, "status: approved\n  delivery: built"),
        `${id}: approved, and built on the line after`,
      );
    }
    assert.match(after("SLICE-ASMT-SCHEDULE"), /\n {2}status: 'approved' # shipped\n {2}delivery: built\n/);
    assert.equal(
      after("RULE-ASMT-AUTH"),
      moveOnly(before.get("RULE-ASMT-AUTH") ?? "").replace("status: released", "status: approved"),
      "a stated delivery is kept as it is",
    );
    assert.equal(
      after("OUT-PREPARE"),
      moveOnly(before.get("OUT-PREPARE") ?? "").replace("status: released", "status: approved"),
    );
    for (const id of ["INT-PREPARE", "ADR-ASMT-SEAM"]) {
      assert.match(after(id), /\n {2}status: approved\n/, id);
      assert.doesNotMatch(after(id), /delivery:/, `${id}'s type never carries delivery`);
    }
    assert.equal(
      after("RULE-ASMT-FUTURE"),
      moveOnly(before.get("RULE-ASMT-FUTURE") ?? ""),
      "deprecated is left as it is",
    );
    const report = JSON.parse((await run(dir, "validate", "--json")).out);
    assert.deepEqual(
      report.diagnostics.filter((d: { code: string }) => d.code === "CORE001"),
      [],
      "every migrated status is one 0.3 lists",
    );
  });
}

test("BEH-MIGRATE: migrate reads past a comment line inside the intentset mapping, at column 0 or indented", async (t) => {
  const { dir } = await atEarlier(t);
  // A column-0 comment between profile and status, and another before type: YAML allows both inside the mapping.
  edit(dir, "RULE-ASMT-AUTH", /^ {2}status: draft$/m, "# shipped in pilot-1\n  status: implemented");
  edit(dir, "RULE-ASMT-AUTH", /^ {2}type: rule$/m, "# a rule\n  type: rule");
  edit(dir, "BEH-ASMT-SCHEDULE", /^ {2}status: draft$/m, "  # shipped\n  status: released");
  edit(dir, "OUT-PREPARE", /^ {2}spec: '0\.2'$/m, "# the version\n  spec: '0.2'");
  git(dir, "commit", "-q", "-am", "comments inside the mapping");

  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 0, moved.err);
  assert.doesNotMatch(moved.out, /declare neither/);
  const auth = readFileSync(RECORD(dir, "RULE-ASMT-AUTH"), "utf8");
  assert.match(auth, /\n# shipped in pilot-1\n {2}status: approved\n {2}delivery: built\n/);
  assert.match(auth, /\n# a rule\n {2}type: rule\n/);
  assert.match(
    readFileSync(RECORD(dir, "BEH-ASMT-SCHEDULE"), "utf8"),
    /\n {2}# shipped\n {2}status: approved\n {2}delivery: built\n/,
  );
  assert.match(readFileSync(RECORD(dir, "OUT-PREPARE"), "utf8"), /\n# the version\n {2}spec: '0\.3'\n/);
  const report = JSON.parse((await run(dir, "validate", "--json")).out);
  assert.deepEqual(
    report.diagnostics.filter((d: { code: string }) => d.code === "CORE001"),
    [],
  );
});

test("BEH-MIGRATE: migrate counts a null or empty delivery as not stated and writes built on that line", async (t) => {
  const { dir } = await atEarlier(t);
  edit(dir, "BEH-ASMT-SCHEDULE", "status: draft", "status: implemented\n  delivery: null");
  edit(dir, "CAP-ASMT-ASSIGN", "status: draft", "delivery: # not said\n  status: released");
  edit(dir, "SLICE-ASMT-SCHEDULE", "status: draft", "status: implemented\n  delivery: ~");
  git(dir, "commit", "-q", "-am", "null and empty delivery");

  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 0, moved.err);
  const after = (id: string) => readFileSync(RECORD(dir, id), "utf8");
  assert.match(after("BEH-ASMT-SCHEDULE"), /\n {2}status: approved\n {2}delivery: built\n/);
  assert.match(after("CAP-ASMT-ASSIGN"), /\n {2}delivery: built # not said\n {2}status: approved\n/);
  assert.match(after("SLICE-ASMT-SCHEDULE"), /\n {2}status: approved\n {2}delivery: built\n/);
  for (const id of ["BEH-ASMT-SCHEDULE", "CAP-ASMT-ASSIGN", "SLICE-ASMT-SCHEDULE"]) {
    assert.equal(after(id).match(/delivery:/g)?.length, 1, `${id} keeps one delivery key`);
  }
  const report = JSON.parse((await run(dir, "validate", "--json")).out);
  assert.deepEqual(
    report.diagnostics.filter((d: { code: string }) => d.code === "CORE001"),
    [],
  );
});

test("BEH-MIGRATE: migrate names a record whose status it could not rewrite, does not count it as moved, and exits 1", async (t) => {
  const { dir, files } = await atEarlier(t);
  // A double-quoted escape the YAML reader reads as implemented, in a form the line rewrite does not read.
  edit(dir, "RULE-ASMT-AUTH", "status: draft", 'status: "implement\\x65d"');
  git(dir, "commit", "-q", "-am", "a status the rewrite cannot read");
  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 1);
  assert.match(moved.out, new RegExp(`moved ${files.length - 1} records to 0\\.3`));
  assert.match(moved.err, /1 record moved to 0\.3 could not be rewritten in full/);
  assert.match(
    moved.err,
    /\n {2}product\/scheduling\/RULE-ASMT-AUTH\.md: still declares a status 0\.3 does not list\n/,
  );
  assert.match(readFileSync(RECORD(dir, "RULE-ASMT-AUTH"), "utf8"), /spec: '0\.3'/, "its spec and profile still move");
});

test("BEH-MIGRATE: migrate reads a quoted or spaced key as YAML does, keeping a stated delivery and writing built after a quoted type", async (t) => {
  const { dir } = await atEarlier(t);
  edit(dir, "RULE-ASMT-AUTH", "status: draft", 'status: implemented\n  "delivery": planned');
  edit(dir, "CAP-ASMT-ASSIGN", "status: draft", "status: released\n  delivery : planned");
  edit(dir, "BEH-ASMT-SCHEDULE", /^ {2}type: behavior$/m, '  "type": behavior');
  edit(dir, "BEH-ASMT-SCHEDULE", "status: draft", "'status' : released");
  git(dir, "commit", "-q", "-am", "quoted and spaced keys");

  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 0, moved.err);
  const after = (id: string) => readFileSync(RECORD(dir, id), "utf8");
  assert.match(after("RULE-ASMT-AUTH"), /\n {2}status: approved\n {2}"delivery": planned\n/);
  assert.match(after("CAP-ASMT-ASSIGN"), /\n {2}status: approved\n {2}delivery : planned\n/);
  assert.match(after("BEH-ASMT-SCHEDULE"), /\n {2}'status' : approved\n {2}delivery: built\n/);
  for (const id of ["RULE-ASMT-AUTH", "CAP-ASMT-ASSIGN", "BEH-ASMT-SCHEDULE"]) {
    assert.equal(after(id).match(/delivery['"]? ?:/g)?.length, 1, `${id} keeps one delivery key`);
  }
  const report = JSON.parse((await run(dir, "validate", "--json")).out);
  assert.deepEqual(
    report.diagnostics.filter((d: { code: string }) => d.code === "CORE001"),
    [],
  );
});

test("BEH-MIGRATE: migrate names a record whose rewrite would lose the delivery its status claimed, and exits 1", async (t) => {
  const { dir, files } = await atEarlier(t);
  // A double-quoted escape the YAML reader reads as behavior, which the line rewrite does not read: the record would
  // become approved with no delivery.
  edit(dir, "BEH-ASMT-SCHEDULE", /^ {2}type: behavior$/m, '  type: "behavio\\x72"');
  edit(dir, "BEH-ASMT-SCHEDULE", "status: draft", "status: released");
  git(dir, "commit", "-q", "-am", "a type the rewrite cannot read");
  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 1);
  assert.match(moved.out, new RegExp(`moved ${files.length - 1} records to 0\\.3`));
  assert.match(moved.err, /\n {2}product\/scheduling\/BEH-ASMT-SCHEDULE\.md: lost the delivery its status claimed\n/);
});

test("BEH-MIGRATE: migrate refuses a tree with uncommitted changes, and a target it does not know, and writes nothing", async (t) => {
  const { dir } = await atEarlier(t);
  edit(dir, "OUT-PREPARE", "teachers spend less time", "teachers spend much less time");
  const wrote = snapshot(dir);
  const dirty = await run(dir, "migrate", "--to", "0.3");
  assert.equal(dirty.code, 2);
  assert.match(dirty.err, /uncommitted changes/);
  assert.match(dirty.err, /--allow-dirty/);
  assert.deepEqual(snapshot(dir), wrote);

  for (const target of ["0.2", "0.4"]) {
    const wrong = await run(dir, "migrate", "--to", target, "--allow-dirty");
    assert.equal(wrong.code, 2);
    assert.match(wrong.err, /the only target is 0\.3, which moves records written for 0\.1 or 0\.2/);
  }
  const missing = await run(dir, "migrate");
  assert.equal(missing.code, 2);
  assert.match(missing.err, /--to is required/);
  assert.deepEqual(snapshot(dir), wrote);

  const allowed = await run(dir, "migrate", "--to", "0.3", "--allow-dirty");
  assert.equal(allowed.code, 0, allowed.err);
  assert.match(readFileSync(RECORD(dir, "OUT-PREPARE"), "utf8"), /teachers spend much less time/, "the edit is kept");

  const bare = await example(t);
  const notGit = await run(bare, "migrate", "--to", "0.3");
  assert.equal(notGit.code, 2);
  assert.match(notGit.err, /not a git work tree/);
});

test("BEH-CONTEXT: context of a file no slice claims names the file, never a malformed ID, and exits 1", async (t) => {
  const dir = await example(t);
  const result = await run(dir, "context", "src/nowhere/else.ts");
  assert.equal(result.code, 1);
  assert.match(
    result.err,
    /error VSA009 No slice claims src\/nowhere\/else\.ts, so there is no context to load for it/,
  );
  assert.doesNotMatch(result.err, /not an artifact ID/);
  const json = JSON.parse((await run(dir, "context", "src/nowhere/else.ts", "--json")).out);
  assert.equal(json.diagnostics[0].code, "VSA009");
  assert.equal(json.diagnostics[0].path, "src/nowhere/else.ts");
});

test("BEH-AGENT-GUIDE: init's registries say what each list holds, and the guide carries a verification template and the way to see one record of each type", async (t) => {
  const dir = temp(t);
  assert.equal((await run(dir, "init")).code, 0);
  const registries = readFileSync(join(dir, ".intentset", "registries.yaml"), "utf8");
  assert.match(
    registries,
    /^roles: \[\] +# roles of the product's users, such as shopper; a product with none still names one$/m,
  );
  assert.match(
    registries,
    /^# one release, one role and one edition, so fill each of those before the first record\.$/m,
  );
  const guide = readFileSync(join(dir, ".intentset", "agents.md"), "utf8");
  assert.match(guide, /^ {2}profile: intentset\/verification\/0\.3$/m);
  assert.match(guide, /^ {4}selector: the test's title, or the describe's name$/m);
  assert.match(guide, /`npx intentset init --example --root <an empty directory>` writes one record of each type/);
  assert.match(
    guide,
    /A capability sits\nunder an outcome, an outcome under an intent, and an intent under the product/,
  );
  const validate = await run(dir, "validate");
  assert.equal(validate.code, 0, validate.out + validate.err);
});

test("BEH-ARCH-CHECK: without TypeScript 7 the command says what it found and what to run, instead of a module error", () => {
  const found = new TypeScriptMissingError("5.9.3", new Error("Cannot find module"));
  const text = typescriptMissing(found, ["architecture", "check", "--mode", "strict"]);
  assert.match(
    text,
    /^intentset: the architecture check needs TypeScript 7, and the `typescript` this repository gives @intentset\/architecture is 5\.9\.3\./,
  );
  assert.match(
    text,
    /`pnpm dlx --package=@intentset\/cli --package=typescript@7 intentset architecture check --mode strict`/,
  );
  assert.match(text, /`npx -p @intentset\/cli -p typescript@7 intentset architecture check --mode strict`/);
  const none = typescriptMissing(new TypeScriptMissingError(null, new Error("x")), []);
  assert.match(
    none,
    /no `typescript` resolves from @intentset\/architecture\. .*`npx -p @intentset\/cli -p typescript@7 intentset`/,
  );
});

/**
 * The example with only its knowledge written for an earlier version, so the sources keep their bytes through the move
 * (it rewrites `spec` and `profile`, which both pin kinds cover) and a review's meaning can be compared across it.
 */
async function knowledgeAtEarlier(t: Parameters<typeof example>[0], version: string, edit?: (text: string) => string) {
  const dir = await example(t);
  const path = RECORD(dir, "KB-ASMT-SCHEDULE");
  const at03 = readFileSync(path, "utf8");
  const earlier = asEarlier(at03, version);
  writeFileSync(path, edit === undefined ? earlier : edit(earlier));
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", `the knowledge at ${version}`);
  return { dir, at03 };
}

const currentAtL4 = async (dir: string) => {
  const report = JSON.parse((await run(dir, "validate", "--level", "L4", "--json")).out);
  return report.diagnostics.filter((d: { code: string }) => d.code === "CORE001" || d.code === "CORE008");
};

for (const version of ["0.2", "0.1"]) {
  test(`BEH-MIGRATE: migrate --to 0.3 from ${version} moves a knowledge review to review, naming file-v1 where it named no hash, so a current review stays current`, async (t) => {
    const whole = (dir: string, id: string) =>
      createHash("sha256")
        .update(readFileSync(RECORD(dir, id)))
        .digest("hex");
    let target = "";
    const { dir } = await knowledgeAtEarlier(t, version, (text) => {
      target = text;
      return text;
    });
    // Before 0.3 a review that named no hash pinned each source's whole file: pin the example's sources that way,
    // with a comment inside the review and another extension beside it.
    let kb = target;
    for (const [line, id] of [...kb.matchAll(/^ {8}([A-Z-]+): '?([0-9a-f]{64})'?$/gm)]) {
      kb = kb.replace(line, `        ${id}: ${whole(dir, id)}`);
    }
    kb = kb
      .replace("      hash: content-v1\n", "      # reviewed in the pilot\n")
      .replace("  extensions:\n", "  extensions:\n    org.example/ticket: LAN-12\n");
    writeFileSync(RECORD(dir, "KB-ASMT-SCHEDULE"), kb);
    git(dir, "commit", "-q", "-am", "a whole-file review beside another extension");

    const moved = await run(dir, "migrate", "--to", "0.3");
    assert.equal(moved.code, 0, moved.err);
    assert.match(moved.out, /moved 1 record to 0\.3/);
    const after = readFileSync(RECORD(dir, "KB-ASMT-SCHEDULE"), "utf8");
    assert.match(
      after,
      /\n {2}review:\n {4}hash: file-v1\n {4}# reviewed in the pilot\n {4}sources:\n(?: {6}[A-Z-]+: [0-9a-f]{64}\n){3} {2}extensions:\n {4}org\.example\/ticket: LAN-12\n---/,
      "the review moves up a level with file-v1 first, and the other extension stays",
    );
    assert.doesNotMatch(after, /intentset\.org\/review/);
    assert.deepEqual(await currentAtL4(dir), [], "the whole-file review is current after the move, as before it");
    // Without file-v1 the same pins would be read as content hashes, and the knowledge would need review.
    writeFileSync(RECORD(dir, "KB-ASMT-SCHEDULE"), after.replace("    hash: file-v1\n", ""));
    assert.deepEqual(
      (await currentAtL4(dir)).map((d: { code: string }) => d.code),
      ["CORE008"],
    );
  });
}

test("BEH-MIGRATE: migrate keeps a content-v1 review content-v1 and drops extensions left empty", async (t) => {
  const { dir, at03 } = await knowledgeAtEarlier(t, "0.2");
  const before = readFileSync(RECORD(dir, "KB-ASMT-SCHEDULE"), "utf8");
  assert.match(before, /\n {2}extensions:\n {4}intentset\.org\/review:\n {6}hash: content-v1\n/);
  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 0, moved.err);
  const after = readFileSync(RECORD(dir, "KB-ASMT-SCHEDULE"), "utf8");
  assert.equal(after, at03, "the record the example holds at 0.3");
  assert.match(after, /\n {2}review:\n {4}hash: content-v1\n/);
  assert.doesNotMatch(after, /extensions:/);
  assert.deepEqual(await currentAtL4(dir), [], "current before the move and after it");
});

test("BEH-MIGRATE: migrate names a record whose review it could not move, and exits 1", async (t) => {
  const { dir, files } = await atEarlier(t);
  // A double-quoted escape the YAML reader reads as the extension's key, in a form the line rewrite does not read.
  edit(dir, "KB-ASMT-SCHEDULE", "    intentset.org/review:\n", '    "intentset.org\\x2Freview":\n');
  git(dir, "commit", "-q", "-am", "a review in flow style");
  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 1);
  assert.match(moved.out, new RegExp(`moved ${files.length - 1} records to 0\\.3`));
  assert.match(
    moved.err,
    /\n {2}product\/scheduling\/KB-ASMT-SCHEDULE\.md: still carries the intentset\.org\/review extension 0\.3 does not read\n/,
  );
});

test("BEH-MIGRATE: migrate leaves the review extension on a record that is not knowledge, names it, and exits 1", async (t) => {
  const { dir, files } = await atEarlier(t);
  // Valid at 0.2, where an extension was never read on a behavior; at 0.3 `review` and the extension are CORE001 there.
  edit(
    dir,
    "BEH-ASMT-SCHEDULE",
    "    flags: []\n---",
    "    flags: []\n  extensions:\n    intentset.org/review:\n      sources:\n        RULE-ASMT-AUTH: abc\n---",
  );
  git(dir, "commit", "-q", "-am", "a review extension on a behavior");
  const moved = await run(dir, "migrate", "--to", "0.3");
  assert.equal(moved.code, 1);
  assert.match(moved.out, new RegExp(`moved ${files.length - 1} records to 0\\.3`));
  assert.match(
    moved.err,
    /\n {2}product\/scheduling\/BEH-ASMT-SCHEDULE\.md: carries the intentset\.org\/review extension on a behavior, which 0\.3 rejects \(only knowledge is reviewed\)\n/,
  );
  const after = readFileSync(RECORD(dir, "BEH-ASMT-SCHEDULE"), "utf8");
  assert.match(after, /\n {2}extensions:\n {4}intentset\.org\/review:\n/, "the extension is left where it was");
  assert.doesNotMatch(after, /\n {2}review:/);
});

for (const [what, change, named] of [
  [
    "an extra key",
    (text: string) =>
      text.replace("      hash: content-v1\n", "      hash: content-v1\n      notes: checked in pilot\n"),
    "the key notes",
  ],
  [
    "a pin key that is not an ID",
    (text: string) => text.replace("        RULE-ASMT-AUTH:", "        rule-asmt-auth:"),
    "the pin key rule-asmt-auth, which is not an ID",
  ],
  [
    "an empty pin",
    (text: string) => text.replace(/^( {8}RULE-ASMT-AUTH:) .*$/m, "$1 ''"),
    "a pin for RULE-ASMT-AUTH that is not a non-empty string",
  ],
  [
    "an empty snapshot",
    (text: string) => text.replace("      hash: content-v1\n", "      hash: content-v1\n      snapshot: ''\n"),
    "a snapshot that is not a non-empty string",
  ],
] as const) {
  test(`BEH-MIGRATE: migrate names a knowledge record whose review extension holds ${what} 0.3 rejects, and exits 1`, async (t) => {
    const { dir, files } = await atEarlier(t);
    const path = RECORD(dir, "KB-ASMT-SCHEDULE");
    const before = readFileSync(path, "utf8");
    const changed = change(before);
    assert.notEqual(changed, before);
    writeFileSync(path, changed);
    git(dir, "commit", "-q", "-am", `a review extension with ${what}`);
    const moved = await run(dir, "migrate", "--to", "0.3");
    assert.equal(moved.code, 1);
    assert.match(moved.out, new RegExp(`moved ${files.length - 1} records to 0\\.3`));
    assert.ok(
      moved.err.includes(
        `\n  product/scheduling/KB-ASMT-SCHEDULE.md: its review holds ${named}, which 0.3 does not read\n`,
      ),
      moved.err,
    );
  });
}
