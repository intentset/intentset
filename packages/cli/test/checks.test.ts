/**
 * The commands above L1: architecture check, evidence import, validate at L2
 * to L4, review and publish, each against a temporary copy of the example
 * with the source tree the VSA fixtures give it.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readExport } from "@intentset/core";
import { edit, example, git, RECORD, REPO, run, snapshot, write } from "./helpers.ts";

type Context = { after(fn: () => void): void };

interface VsaCase {
  name: string;
  files?: Record<string, string>;
  sources?: Record<string, string>;
}
const VSA = JSON.parse(readFileSync(join(REPO, "tests", "vsa.json"), "utf8")) as VsaCase[];
const vsaCase = (prefix: string) => VSA.find((c) => c.name.startsWith(prefix)) as VsaCase;

/** The example plus the source tree its claims describe: valid at L2. */
async function withSources(t: Context): Promise<string> {
  const dir = await example(t);
  write(dir, vsaCase("VSA baseline").sources ?? {});
  return dir;
}

const TEST_FILE = "src/features/assessment/schedule/schedule.test.ts";
const TITLE = "schedule [schedule-review-v1] accepts a future time";

/** The example with sources, its verification made automated with a real locator, committed in a git repository. */
async function committed(t: Context): Promise<string> {
  const dir = await withSources(t);
  edit(dir, "TEST-ASMT-SCHEDULE", "method: manual", "method: automated");
  edit(dir, "TEST-ASMT-SCHEDULE", "locator: examples/scheduling/TEST-ASMT-SCHEDULE.md", `locator: ${TEST_FILE}`);
  write(dir, {
    [TEST_FILE]: `import { test } from "vitest";\ntest(${JSON.stringify(TITLE)}, () => {});\n`,
    ".gitignore": ".intentset/evidence/\nreports/\n",
  });
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "example");
  return dir;
}

function vitestReport(status: "passed" | "failed", title = TITLE): string {
  return JSON.stringify({
    testResults: [
      {
        name: TEST_FILE,
        status,
        assertionResults: [
          {
            ancestorTitles: [],
            title,
            fullName: title,
            status,
            duration: 2,
            failureMessages: status === "failed" ? ["AssertionError: expected 1 to be 2"] : [],
          },
        ],
      },
    ],
  });
}

const IMPORT = ["--product", "PRD-LANTERN", "--release", "pilot-1"];

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Knowledge approved and reviewed, its pins the real hashes of its sources as they are now. */
function approveKnowledge(dir: string, pins = true): void {
  const lines = ["  reviewedBy: team-assessment", "  reviewedAt: '2026-10-02'"];
  if (pins) {
    lines.push("  extensions:", "    intentset.org/review:", "      sources:");
    for (const id of ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"]) {
      lines.push(`        ${id}: ${sha256(RECORD(dir, id))}`);
    }
  }
  edit(dir, "KB-ASMT-SCHEDULE", "  status: draft\n", "  status: approved\n");
  edit(dir, "KB-ASMT-SCHEDULE", "  revision: 1\n", `  revision: 1\n${lines.join("\n")}\n`);
}

test("architecture check on the example with its source tree is clean at L2, and says what it did not check", async (t) => {
  const dir = await withSources(t);
  const check = await run(dir, "architecture", "check");
  assert.equal(check.code, 0, check.out + check.err);
  assert.match(check.out, /^0 errors, 0 warnings from the architecture check$/m);
  assert.match(check.out, /Architecture \(L2, migration mode\): 1 active slice; 9 files claimed, 0 unclaimed/);
  assert.match(check.out, /Not checked, so not a pass \(0\): none/);
  assert.match(check.out, /Left to review, which this check cannot decide from source \(6\):\n {2}- VSA007 /);
  const report = JSON.parse((await run(dir, "architecture", "check", "--json")).out);
  assert.deepEqual(report.summary.unresolved, []);
  assert.equal(report.summary.reviewRequired.length, 6);
  assert.equal(typeof report.summary.outOfScope, "number");
  assert.equal((await run(dir, "validate", "--level", "L2")).code, 0);
});

test("architecture check without the source tree: a draft slice's paths are planned, an approved slice's are missing", async (t) => {
  const dir = await example(t);
  const planned = await run(dir, "architecture", "check");
  assert.equal(planned.code, 1, "the registry resource naming no file is an error whatever the slice's status");
  assert.match(planned.out, /warning VSA002 \[SLICE-ASMT-SCHEDULE\] .* draft slice .* is not a file yet/);
  assert.match(
    planned.out,
    /warning VSA009 \[SLICE-ASMT-SCHEDULE\] The source claim .* of draft slice .* matches no file yet/,
  );
  assert.match(planned.out, /error VSA009 .*RES-ASSESSMENT-DATA/);

  edit(dir, "SLICE-ASMT-SCHEDULE", "status: draft", "status: approved");
  const check = await run(dir, "architecture", "check");
  assert.equal(check.code, 1);
  assert.match(check.out, /error VSA002 \[SLICE-ASMT-SCHEDULE\]/);
  assert.match(check.out, /error VSA009 \[SLICE-ASMT-SCHEDULE\] The source claim/);
  const validate = await run(dir, "validate", "--level", "L2");
  assert.equal(validate.code, 1, "L2 includes the architecture check");
  assert.match(validate.out, /VSA002/);
  assert.equal((await run(dir, "validate")).code, 0, "L1 does not");
});

test("a deep import into another slice's internals is VSA003 and exits 1", async (t) => {
  const dir = await example(t);
  const deep = vsaCase("V02 a relative deep import");
  for (const [name, text] of Object.entries(deep.files ?? {})) writeFileSync(RECORD(dir, name.slice(0, -3)), text);
  write(dir, deep.sources ?? {});
  const check = await run(dir, "architecture", "check");
  assert.equal(check.code, 1);
  assert.match(
    check.out,
    /^src\/features\/assessment\/results\/domain\/use-cases\/summarize-results\.ts:1 error VSA003 /m,
  );
  assert.match(check.out, /^ {2}fix: /m);
});

test("a baseline written by --write-baseline turns known violations into warnings in migration mode only", async (t) => {
  const dir = await example(t);
  // Approved, so its missing paths are errors rather than planned warnings, and there is something to baseline.
  edit(dir, "SLICE-ASMT-SCHEDULE", "status: draft", "status: approved");
  const before = snapshot(dir);
  const written = await run(dir, "architecture", "check", "--write-baseline", "baseline.json");
  assert.equal(written.code, 1, "this run's errors are still errors");
  assert.match(written.err, /wrote 4 baseline entries to baseline\.json/);
  const after = snapshot(dir);
  assert.deepEqual(
    [...after.keys()].filter((path) => !before.has(path)),
    [join(dir, "baseline.json")],
  );

  const migration = await run(dir, "architecture", "check", "--baseline", "baseline.json");
  assert.equal(migration.code, 0, migration.out);
  assert.match(migration.out, /warning VSA002 .*\(baselined\)/);
  assert.match(migration.out, /4 baselined/);
  const strict = await run(dir, "architecture", "check", "--baseline", "baseline.json", "--mode", "strict");
  assert.equal(strict.code, 1);

  const refused = await run(dir, "architecture", "check", "--write-baseline", RECORD(dir, "PRD-LANTERN"));
  assert.equal(refused.code, 2);
  assert.match(refused.err, /is a file the repository reads/);
  const broken = await run(dir, "architecture", "check", "--baseline", "product/scheduling/PRD-LANTERN.md");
  assert.equal(broken.code, 2);
});

test("a file with no text extension is in the tree, so importing a stylesheet resolves", async (t) => {
  const dir = await withSources(t);
  write(dir, {
    "src/features/assessment/schedule/ui/screens/Schedule.module.css": ".form { display: grid; }\n",
    "src/features/assessment/schedule/ui/screens/ScheduleScreen.tsx":
      'import styles from "./Schedule.module.css";\nimport { useSchedule } from "../hooks/use-schedule";\n\nexport function ScheduleScreen() {\n  const schedule = useSchedule();\n  return <form className={styles.form} onSubmit={() => schedule({ assessmentId: "a", classId: "c", releaseAt: "2030-01-01T00:00:00Z" })} />;\n}\n',
  });
  const check = await run(dir, "architecture", "check");
  assert.equal(check.code, 0, check.out);
  assert.doesNotMatch(check.out, /TS004/);
});

test("in a git repository the tree is git's: a .gitignored source file is not read", async (t) => {
  const dir = await withSources(t);
  write(dir, { "src/generated/client.ts": "export const generated = true;\n" });
  const walked = await run(dir, "architecture", "check");
  assert.equal(walked.code, 1, "without git the unowned file is read");
  assert.match(walked.out, /src\/generated\/client\.ts .*VSA009/);

  write(dir, { ".gitignore": "src/generated/\n" });
  git(dir, "init", "-q");
  const listed = await run(dir, "architecture", "check");
  assert.equal(listed.code, 0, listed.out);
});

test("evidence import binds a Vitest report to the commit, and L3 reads it as a current pass", async (t) => {
  const dir = await committed(t);
  const head = git(dir, "rev-parse", "HEAD");
  write(dir, { "reports/vitest.json": vitestReport("passed") });
  const imported = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "vitest",
    "reports/vitest.json",
    "--out",
    ".intentset/evidence/run-1.json",
    ...IMPORT,
    "--tool-version",
    "3.2.0",
  );
  assert.equal(imported.code, 0, imported.err);
  assert.match(imported.out, /^Imported 1 run record from reports\/vitest\.json \(vitest, 1 test\)/);
  assert.match(imported.out, new RegExp(`bound to commit ${head}, graph [0-9a-f]{64}, for PRD-LANTERN pilot-1`));
  assert.match(imported.out, /timestamps: the report file's modification time/);
  assert.match(imported.out, /TEST-ASMT-SCHEDULE {2}pass/);
  assert.match(imported.out, /Unmatched selectors \(0\): none/);
  const records = JSON.parse(readFileSync(join(dir, ".intentset", "evidence", "run-1.json"), "utf8"));
  assert.equal(records.length, 1);
  assert.equal(records[0].commit, head);
  assert.deepEqual(records[0].tool, { name: "vitest", version: "3.2.0" });

  const l3 = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.equal(l3.code, 0, l3.out);
  assert.match(l3.out, /Evidence: 1 run record from \.intentset\/evidence\/run-1\.json/);
  assert.match(l3.out, /^ {2}verified: {2}1 of 1 behavior, 2 of 2 rules, 1 of 1 scenario {2}\(evidence: /m);
  assert.match(l3.out, /^ {2}TEST-ASMT-SCHEDULE {2}automated {2}current-pass$/m);
  assert.doesNotMatch(l3.out, /%/, "coverage is counts, never a percentage");
  const json = JSON.parse((await run(dir, "validate", "--level", "L3", ...IMPORT, "--json")).out);
  assert.deepEqual(json.evidence.coverage.verified, { behaviors: 1, rules: 2, scenarios: 1 });
  assert.equal(json.evidence.verifications["TEST-ASMT-SCHEDULE"].status, "current-pass");

  // A new commit changes the snapshot, and the same record is stale.
  edit(dir, "RULE-ASMT-FUTURE", "must be earlier", "must be strictly earlier");
  git(dir, "commit", "-q", "-am", "tighten the rule");
  const stale = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(stale.out, /^ {2}TEST-ASMT-SCHEDULE {2}automated {2}stale$/m);
  assert.match(stale.out, /^ {2}verified: {2}0 of 1 behavior, 0 of 2 rules, 0 of 1 scenario/m);
});

test("at L3 an approved behavior without a current pass is CORE007", async (t) => {
  const dir = await committed(t);
  for (const id of ["BEH-ASMT-SCHEDULE", "SLICE-ASMT-SCHEDULE"]) edit(dir, id, "status: draft", "status: approved");
  git(dir, "commit", "-q", "-am", "approve");
  const l3 = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.equal(l3.code, 1);
  assert.match(l3.out, /error CORE007 \[BEH-ASMT-SCHEDULE\] Approved behavior BEH-ASMT-SCHEDULE is not verified/);
  assert.match(l3.out, /Evidence: 0 run records from no evidence files/);
});

test("evidence import lists unmatched selectors, reads node:test TAP, and refuses what it must", async (t) => {
  const dir = await committed(t);
  write(dir, {
    "reports/other.json": vitestReport("passed", "something else entirely"),
    "reports/run.tap": `TAP version 13\n# Subtest: ${TITLE}\nok 1 - ${TITLE}\n  ---\n  duration_ms: 1.5\n  ...\n1..1\n`,
  });
  const unmatched = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "vitest",
    "reports/other.json",
    "--out",
    "out/a.json",
    ...IMPORT,
  );
  assert.equal(unmatched.code, 0, unmatched.err);
  assert.match(unmatched.out, /Imported 0 run records/);
  assert.match(
    unmatched.out,
    /Unmatched selectors \(1\): .*read as missing\n {2}- schedule-review-v1 \(TEST-ASMT-SCHEDULE\)/,
  );

  const tap = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "node-tap",
    "reports/run.tap",
    "--out",
    "out/b.json",
    ...IMPORT,
    "--started-at",
    "2026-10-02T12:00:00Z",
    "--finished-at",
    "2026-10-02T12:00:05Z",
  );
  assert.equal(tap.code, 0, tap.err);
  assert.doesNotMatch(tap.out, /timestamps:/);
  const record = JSON.parse(readFileSync(join(dir, "out", "b.json"), "utf8"))[0];
  assert.equal(record.result, "pass");
  assert.equal(record.tool.name, "node:test");
  assert.equal(record.finishedAt, "2026-10-02T12:00:05Z");

  const again = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "node-tap",
    "reports/run.tap",
    "--out",
    "out/b.json",
    ...IMPORT,
  );
  assert.equal(again.code, 2);
  assert.match(again.err, /exists; run records are history/);
  const intoScope = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "node-tap",
    "reports/run.tap",
    "--out",
    RECORD(dir, "PRD-LANTERN"),
    ...IMPORT,
  );
  assert.equal(intoScope.code, 2);
  const unknownProduct = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "node-tap",
    "reports/run.tap",
    "--out",
    "out/c.json",
    "--product",
    "PRD-NOPE",
    "--release",
    "pilot-1",
  );
  assert.equal(unknownProduct.code, 2);

  edit(dir, "RULE-ASMT-FUTURE", "must be earlier", "must be strictly earlier");
  const dirty = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "node-tap",
    "reports/run.tap",
    "--out",
    "out/d.json",
    ...IMPORT,
  );
  assert.equal(dirty.code, 2);
  assert.match(dirty.err, /tracked files differ from commit/);
  assert.equal(existsSync(join(dir, "out", "d.json")), false);
});

test("evidence import outside a git repository refuses: evidence must name a commit", async (t) => {
  const dir = await withSources(t);
  write(dir, { "reports/vitest.json": vitestReport("passed") });
  const imported = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "vitest",
    "reports/vitest.json",
    "--out",
    "e.json",
    ...IMPORT,
  );
  assert.equal(imported.code, 2);
  assert.match(imported.err, /evidence must name the commit it ran at/);
});

test("L4 adds publication readiness: active knowledge without a current review is CORE008", async (t) => {
  const dir = await withSources(t);
  approveKnowledge(dir, false);
  const unpinned = await run(dir, "validate", "--level", "L4");
  assert.equal(unpinned.code, 1);
  assert.match(
    unpinned.out,
    /^product\/scheduling\/KB-ASMT-SCHEDULE\.md error CORE008 \[KB-ASMT-SCHEDULE\] approved knowledge KB-ASMT-SCHEDULE needs review: no review pin for BEH-ASMT-SCHEDULE, RULE-ASMT-AUTH, RULE-ASMT-FUTURE/m,
  );
  const json = JSON.parse((await run(dir, "validate", "--level", "L4", "--json")).out);
  assert.equal(json.diagnostics.find((d: { code: string }) => d.code === "CORE008").origin, "publication");
  assert.equal((await run(dir, "validate", "--level", "L3")).code, 0, "L3 does not check publication");

  const pinned = await withSources(t);
  approveKnowledge(pinned);
  const current = await run(pinned, "validate", "--level", "L4");
  assert.equal(current.code, 0, current.out);
  assert.match(current.out, /Publication readiness: 1 active knowledge artifact checked .* \(KB-ASMT-SCHEDULE\)/);

  edit(pinned, "KB-ASMT-SCHEDULE", /\n {2}availability:\n(?: {4}.*\n)+/, "\n");
  const unavailable = await run(pinned, "validate", "--level", "L4");
  assert.match(
    unavailable.out,
    /error CORE008 \[KB-ASMT-SCHEDULE\] approved knowledge KB-ASMT-SCHEDULE has no availability/,
  );
});

test("review of a changed rule lists its behavior, verification and knowledge as direct and its slice as a candidate", async (t) => {
  const dir = await committed(t);
  edit(dir, "RULE-ASMT-FUTURE", "must be earlier", "must be strictly earlier");
  git(dir, "commit", "-q", "-am", "tighten the rule");
  write(dir, {
    "src/features/assessment/schedule/domain/policies/release-time.ts":
      'import type { ScheduleRequest } from "../models/schedule";\n\nexport function isFutureRelease(request: ScheduleRequest, now: Date): boolean {\n  return Date.parse(request.releaseAt) > now.getTime() + 1000;\n}\n',
    "NOTES.txt": "scratch\n",
  });
  const before = snapshot(dir);
  const review = await run(dir, "review");
  assert.equal(review.code, 0, review.out + review.err);
  assert.match(review.out, /^# Review$/m);
  assert.match(review.out, /^- Base: HEAD~1, [0-9a-f]{40}$/m);
  assert.match(review.out, /^- Changed: 3 files \(1 committed since the base, 2 uncommitted\)$/m);
  assert.match(review.out, /^- Level: L2, the highest the inputs allow: no run records/m);
  assert.match(review.out, /not proof that runtime behavior changed/);

  const rule = review.out.slice(review.out.indexOf("### RULE-ASMT-FUTURE"), review.out.indexOf("## Changed files"));
  assert.match(rule, /- Changed: product\/scheduling\/RULE-ASMT-FUTURE\.md is its record/);
  const direct = rule.slice(rule.indexOf("Direct"), rule.indexOf("Candidates"));
  const candidates = rule.slice(rule.indexOf("Candidates"));
  for (const id of ["BEH-ASMT-SCHEDULE", "TEST-ASMT-SCHEDULE", "KB-ASMT-SCHEDULE"])
    assert.match(direct, new RegExp(`- ${id} `));
  assert.match(
    candidates,
    /- SLICE-ASMT-SCHEDULE \(slice\): `SLICE-ASMT-SCHEDULE --implements--> BEH-ASMT-SCHEDULE --governedBy--> RULE-ASMT-FUTURE`/,
  );

  assert.match(
    review.out,
    /### BEH-ASMT-SCHEDULE: Schedule an assessment\n\n- Changed: src\/features\/assessment\/schedule\/domain\/policies\/release-time\.ts is claimed by SLICE-ASMT-SCHEDULE, which implements it/,
  );
  assert.match(review.out, /## Changed files no artifact accounts for \(1\)\n\n- NOTES\.txt/);
  assert.deepEqual(snapshot(dir), before, "review writes nothing, inside .git included");

  const json = JSON.parse((await run(dir, "review", "--json")).out);
  assert.deepEqual(
    json.impact.map((item: { start: string }) => item.start),
    ["BEH-ASMT-SCHEDULE", "RULE-ASMT-FUTURE"],
  );
  assert.equal((await run(dir, "review", "--base", "no-such-ref")).code, 2);
});

const POLICY = "src/features/assessment/schedule/domain/policies/release-time.ts";
const STRICTER =
  'import type { ScheduleRequest } from "../models/schedule";\n\nexport function isFutureRelease(request: ScheduleRequest, now: Date): boolean {\n  return Date.parse(request.releaseAt) > now.getTime() + 1000;\n}\n';

test("review lists a slice whose code changed while none of its records did, and --fail-on-drift fails on it", async (t) => {
  const dir = await committed(t);
  write(dir, { [POLICY]: STRICTER });
  git(dir, "commit", "-q", "-am", "stricter release time");

  const review = await run(dir, "review");
  assert.equal(review.code, 0, "drift is a prompt, not an error, without --fail-on-drift");
  assert.match(review.out, /^## Code changed, records unchanged \(1, 1 not acknowledged\)$/m);
  const section = review.out.slice(
    review.out.indexOf("### SLICE-ASMT-SCHEDULE"),
    review.out.indexOf("## Changed files"),
  );
  assert.match(section, /- Not acknowledged: update the records below/);
  assert.match(section, new RegExp(`- Code changed: ${POLICY.replaceAll(".", "\\.")}`));
  assert.match(
    section,
    /- Records describing it, none changed: ADR-ASMT-SEAM, BEH-ASMT-SCHEDULE, CONTRACT-ASMT-SCHEDULE, RULE-ASMT-AUTH, RULE-ASMT-FUTURE, SCN-ASMT-SCHEDULE, SLICE-ASMT-SCHEDULE, TEST-ASMT-SCHEDULE/,
  );
  assert.equal((await run(dir, "review", "--fail-on-drift")).code, 1);

  const json = JSON.parse((await run(dir, "review", "--json")).out);
  assert.deepEqual(
    json.drift.map((item: { slice: string; code: string[]; acknowledged: boolean }) => [
      item.slice,
      item.code,
      item.acknowledged,
    ]),
    [["SLICE-ASMT-SCHEDULE", [POLICY], false]],
  );

  // A commit after the base says no behavior changed: acknowledged, still listed, and no longer failing.
  write(dir, { [POLICY]: `${STRICTER}// one second of tolerance, as before\n` });
  git(dir, "commit", "-q", "-am", "comment the tolerance\n\nIntentset-Unchanged: SLICE-ASMT-SCHEDULE");
  const acknowledged = await run(dir, "review", "--base", "HEAD~2", "--fail-on-drift");
  assert.equal(acknowledged.code, 0, acknowledged.out);
  assert.match(acknowledged.out, /\(1, 0 not acknowledged\)/);
  assert.match(acknowledged.out, /- Acknowledged: a commit since the base says this changes no behavior/);
});

test("review lists no drift when a record describing the slice changed with its code, or when nothing it claims as code did", async (t) => {
  const dir = await committed(t);
  write(dir, { [POLICY]: STRICTER });
  edit(dir, "RULE-ASMT-FUTURE", "must be earlier", "must be strictly earlier");
  const both = await run(dir, "review", "--fail-on-drift");
  assert.equal(both.code, 0, both.out);
  assert.match(both.out, /^## Code changed, records unchanged \(0, 0 not acknowledged\)$/m);

  const other = await committed(t);
  write(other, { "amplify/data/resource.ts": "export const data = {};\n", "NOTES.txt": "scratch\n" });
  const unclaimed = await run(other, "review", "--fail-on-drift");
  assert.equal(unclaimed.code, 0, unclaimed.out);
  assert.match(unclaimed.out, /\(0, 0 not acknowledged\)/);
});

test("context of a file a slice claims is that slice's context, and of an unclaimed file a CORE003", async (t) => {
  const dir = await withSources(t);
  const context = await run(dir, "context", POLICY);
  assert.equal(context.code, 0, context.err);
  assert.match(context.out, /^# Context for SLICE-ASMT-SCHEDULE$/m);
  assert.match(context.out, new RegExp(`${POLICY.replaceAll(".", "\\.")} is claimed by SLICE-ASMT-SCHEDULE`));
  assert.match(context.out, /### BEH-ASMT-SCHEDULE: Schedule an assessment/);

  const nested = await run(join(dir, "src", "features"), "context", "assessment/schedule/index.ts", "--json");
  assert.equal(nested.code, 0, nested.err);
  const json = JSON.parse(nested.out);
  assert.equal(json.start, "SLICE-ASMT-SCHEDULE");
  assert.equal(json.resolvedFrom, "src/features/assessment/schedule/index.ts");

  const unclaimed = await run(dir, "context", "NOTES.txt");
  assert.equal(unclaimed.code, 1);
  assert.match(unclaimed.err, /CORE003/);
});

test("review runs at L4 when run records are present", async (t) => {
  const dir = await committed(t);
  write(dir, { "reports/vitest.json": vitestReport("passed") });
  assert.equal(
    (
      await run(
        dir,
        "evidence",
        "import",
        "--from",
        "vitest",
        "reports/vitest.json",
        "--out",
        ".intentset/evidence/a.json",
        ...IMPORT,
      )
    ).code,
    0,
  );
  const review = await run(dir, "review");
  assert.match(review.out, /^- Level: L4, the highest the inputs allow: run records were given or found$/m);
  assert.match(review.out, /TEST-ASMT-SCHEDULE {2}automated {2}current-pass/);
  assert.match(review.out, /Publication readiness: 0 active knowledge artifacts checked/);
});

const REQUEST = [
  "--visibility",
  "customer",
  "--audience",
  "teacher",
  "--product",
  "PRD-LANTERN",
  "--release",
  "pilot-1",
  "--role",
  "teacher",
  "--edition",
  "standard",
  "--published-at",
  "2026-10-02T12:00:00Z",
];

test("publish from the all-draft example publishes nothing and says why", async (t) => {
  const dir = await example(t);
  const published = await run(dir, "publish", ...REQUEST, "--out", "published");
  assert.equal(published.code, 0, published.out + published.err);
  assert.match(
    published.out,
    /^Published 0 documents for a customer projection: audience teacher, PRD-LANTERN pilot-1/m,
  );
  assert.match(published.out, /Excluded, among what this projection may see \(draft 1\)/);
  const index = JSON.parse(readFileSync(join(dir, "published", "index.json"), "utf8"));
  assert.deepEqual(index.published, []);
  assert.deepEqual(readdirSync(join(dir, "published")).sort(), ["chunks.jsonl", "index.json"]);
});

test("publish writes reviewed knowledge with provenance, HTML, an index and chunks, naming no internal source", async (t) => {
  const dir = await example(t);
  approveKnowledge(dir);
  const published = await run(dir, "publish", ...REQUEST, "--html", "--out", "out/kb");
  assert.equal(published.code, 0, published.out + published.err);
  assert.match(published.out, /^Published 1 document .*\n {2}KB-ASMT-SCHEDULE$/m);
  const out = join(dir, "out", "kb");
  assert.deepEqual(readdirSync(out).sort(), [
    "KB-ASMT-SCHEDULE.html",
    "KB-ASMT-SCHEDULE.md",
    "chunks.jsonl",
    "index.json",
  ]);
  const markset = readFileSync(join(out, "KB-ASMT-SCHEDULE.md"), "utf8");
  assert.match(markset, /intentset\/publication\/0\.1/);
  for (const internal of ["Schedule an assessment", "Require a future release time", "BEH-ASMT-SCHEDULE.md"]) {
    for (const file of readdirSync(out))
      assert.ok(!readFileSync(join(out, file), "utf8").includes(internal), `${file}: ${internal}`);
  }
  const chunks = readFileSync(join(out, "chunks.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.ok(chunks.length >= 1);
  assert.ok(
    chunks.every((chunk: { publication: { projection: string } }) => chunk.publication.projection === "customer"),
  );
  assert.deepEqual(JSON.parse(readFileSync(join(out, "index.json"), "utf8")).published, ["KB-ASMT-SCHEDULE"]);

  const notEmpty = await run(dir, "publish", ...REQUEST, "--out", "out/kb");
  assert.equal(notEmpty.code, 2);
  assert.match(notEmpty.err, /is not empty/);
  const inScope = await run(dir, "publish", ...REQUEST, "--out", "product/published");
  assert.equal(inScope.code, 2);
  assert.match(inScope.err, /inside the documents' scope/);
  assert.equal(existsSync(join(dir, "product", "published")), false);
});

test("publish refuses a graph that does not validate, and a request missing a dimension", async (t) => {
  const dir = await example(t);
  approveKnowledge(dir);
  const partial = await run(dir, "publish", "--visibility", "customer", "--audience", "teacher", "--out", "partial");
  assert.equal(partial.code, 1);
  assert.match(partial.out, /error PUB001 /);
  assert.match(partial.out, /The request was refused, so nothing was projected and nothing was written\./);
  assert.equal(existsSync(join(dir, "partial")), false);

  edit(dir, "BEH-ASMT-SCHEDULE", /- RULE-ASMT-AUTH$/m, "- RULE-ASMT-MISSING");
  const broken = await run(dir, "publish", ...REQUEST, "--out", "broken");
  assert.equal(broken.code, 1);
  assert.match(broken.err, /refused: validation at L1 has 1 error/);
  assert.equal(existsSync(join(dir, "broken")), false);
});

test("validate --level L5 is refused as a claim one run cannot check", async (t) => {
  const dir = await example(t);
  mkdirSync(join(dir, "x"));
  const l5 = await run(dir, "validate", "--level", "L5");
  assert.equal(l5.code, 2);
  assert.match(l5.err, /L5 is a claim about continuous CI, not something one run can check \(Core §11\)/);
});

test("graph --report all at L3 writes every report at the commit, and a consumer's reader accepts it", async (t) => {
  const dir = await committed(t);
  const head = git(dir, "rev-parse", "HEAD");
  write(dir, { "reports/vitest.json": vitestReport("passed") });
  const imported = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "vitest",
    "reports/vitest.json",
    "--out",
    ".intentset/evidence/run-1.json",
    ...IMPORT,
  );
  assert.equal(imported.code, 0, imported.err);
  edit(dir, "RULE-ASMT-AUTH", "visibility: internal", "visibility: restricted");
  git(dir, "commit", "-q", "-am", "restrict the authorization rule");
  const reimported = await run(
    dir,
    "evidence",
    "import",
    "--from",
    "vitest",
    "reports/vitest.json",
    "--out",
    ".intentset/evidence/run-2.json",
    ...IMPORT,
  );
  assert.equal(reimported.code, 0, reimported.err);
  const now = git(dir, "rev-parse", "HEAD");
  assert.notEqual(now, head);

  const graph = await run(
    dir,
    "graph",
    "--level",
    "L3",
    "--release",
    "PRD-LANTERN:pilot-1",
    "--report",
    "all",
    "--out",
    "export.json",
  );
  assert.equal(graph.code, 0, graph.err);
  assert.match(graph.err, /reports: evidence, knowledge, impact, ownership; 1 restricted artifact withheld/);
  const text = readFileSync(join(dir, "export.json"), "utf8");
  const read = readExport(text, { repository: "example/lantern", product: "PRD-LANTERN" });
  assert.ok(read.ok, read.ok ? "" : JSON.stringify(read.problems));
  if (!read.ok) return;
  const { envelope } = read;
  assert.deepEqual(read.supplied, ["evidence", "knowledge", "impact", "ownership"]);
  assert.deepEqual(envelope.source, { commit: now, uncommitted: false });
  assert.equal(envelope.reports.evidence?.verifications[0].status, "current-pass");
  assert.equal(envelope.reports.evidence?.verifications[0].atSnapshot.pass, 1, "the run at the old commit is history");
  assert.ok(
    envelope.reports.ownership?.files.some(
      (f) => f.path === "src/features/assessment/schedule/index.ts" && f.owner === "SLICE-ASMT-SCHEDULE",
    ),
  );
  assert.ok(envelope.reports.ownership?.files.some((f) => f.path === TEST_FILE && f.region === "test"));
  assert.ok(!text.includes("RULE-ASMT-AUTH"), "the restricted rule appears nowhere");

  const everything = await run(dir, "graph", "--report", "knowledge", "--include-restricted");
  assert.equal(everything.code, 0, everything.err);
  assert.ok(everything.out.includes("RULE-ASMT-AUTH"));
  assert.deepEqual(JSON.parse(everything.out).withholding.visibilities, []);
});

test("graph refuses a report its level does not read, and a report it does not know", async (t) => {
  const dir = await withSources(t);
  const low = await run(dir, "graph", "--report", "evidence");
  assert.equal(low.code, 2);
  assert.match(low.err, /--report evidence needs --level L3 or above, where run records are read/);
  const ownership = await run(dir, "graph", "--report", "ownership");
  assert.match(ownership.err, /--report ownership needs --level L2 or above/);
  const unknown = await run(dir, "graph", "--report", "coverage");
  assert.match(unknown.err, /--report coverage: the reports are evidence, knowledge, impact, ownership, or all/);
  const all = await run(dir, "graph", "--report", "all");
  assert.equal(all.code, 0, all.err);
  assert.deepEqual(Object.keys(JSON.parse(all.out).reports), ["knowledge", "impact"], "all is what L1 reads");
});
