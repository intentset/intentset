/**
 * The commands above L1: architecture check, evidence import, validate at L2
 * to L4, review and publish, each against a temporary copy of the example
 * with the source tree the VSA fixtures give it.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readExport } from "@intentset/core";
import { changedSince } from "../src/git.ts";
import { edit, example, git, RECORD, REPO, run, snapshot, temp, write } from "./helpers.ts";

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

/**
 * The example's knowledge is approved and reviewed against its sources as they are (since 2026-10-11), so publication
 * releases it as the example stands. These two undo parts of that: the review pins, leaving an approved record with
 * nothing to say what it was reviewed against; and the approval, leaving the draft it used to be.
 */
function unpinKnowledge(dir: string): void {
  edit(dir, "KB-ASMT-SCHEDULE", /\n {2}extensions:\n(?: {4,}.*\n)+/, "\n");
}
function draftKnowledge(dir: string): void {
  edit(dir, "KB-ASMT-SCHEDULE", "  status: approved\n", "  status: draft\n");
}

test("BEH-ARCH-CHECK: architecture check on the example with its source tree is clean at L2, and says what it did not check", async (t) => {
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

test("BEH-ARCH-CHECK: architecture check without the source tree: a draft slice's paths are planned, an approved slice's are missing", async (t) => {
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

test("BEH-ARCH-CHECK: a deep import into another slice's internals is VSA003 and exits 1", async (t) => {
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

test("BEH-ARCH-BASELINE: a baseline written by --write-baseline turns known violations into warnings in migration mode only", async (t) => {
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

test("BEH-EVIDENCE-IMPORT, BEH-EVIDENCE-CURRENT: evidence import binds a Vitest report to the commit, and L3 reads it as a current pass", async (t) => {
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
  // The example has slices that claim files, so subject binding is the default (Core §8): the record carries the
  // subject's hash, and the commit stays as provenance.
  assert.equal(records[0].binding, "subject");
  assert.match(records[0].subjectHash, /^[0-9a-f]{64}$/);
  assert.match(imported.out, /binding: subject \(the default, since slices claim files\)/);

  const l3 = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.equal(l3.code, 0, l3.out);
  assert.match(l3.out, /Evidence: 1 run record from \.intentset\/evidence\/run-1\.json/);
  assert.match(l3.out, /^ {2}verified: {2}1 of 1 behavior, 2 of 2 rules, 1 of 1 scenario {2}\(evidence: /m);
  assert.match(
    l3.out,
    /^ {2}TEST-ASMT-SCHEDULE {2}automated {2}current-pass {2}\[subject\] {2}\(judged by subject binding; the run was at commit /m,
  );
  assert.match(l3.out, /^Binding: subject \(the default, since slices claim files\)/m);
  assert.doesNotMatch(l3.out, /%/, "coverage is counts, never a percentage");
  const json = JSON.parse((await run(dir, "validate", "--level", "L3", ...IMPORT, "--json")).out);
  assert.deepEqual(json.evidence.coverage.verified, { behaviors: 1, rules: 2, scenarios: 1 });
  assert.equal(json.evidence.verifications["TEST-ASMT-SCHEDULE"].status, "current-pass");

  // A new commit that changes nothing the check is about moves the snapshot and not the subject: still current.
  edit(dir, "OUT-PREPARE", "teachers spend less time", "teachers spend much less time");
  git(dir, "commit", "-q", "-am", "reword an outcome");
  const unrelated = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(unrelated.out, /^ {2}TEST-ASMT-SCHEDULE {2}automated {2}current-pass {2}\[subject\]/m);

  // A commit that changes the rule the check verifies makes the same record stale, and the note says which part moved.
  edit(dir, "RULE-ASMT-FUTURE", "must be earlier", "must be strictly earlier");
  git(dir, "commit", "-q", "-am", "tighten the rule");
  const stale = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(
    stale.out,
    /^ {2}TEST-ASMT-SCHEDULE {2}automated {2}stale {2}\[subject\] {2}\(the subject changed since the run at commit [0-9a-f]{9}: verified RULE-ASMT-FUTURE\)$/m,
  );
  assert.match(stale.out, /^ {2}verified: {2}0 of 1 behavior, 0 of 2 rules, 0 of 1 scenario/m);
});

test("BEH-EVIDENCE-CURRENT: at L3 an approved behavior without a current pass is CORE007", async (t) => {
  const dir = await committed(t);
  for (const id of ["BEH-ASMT-SCHEDULE", "SLICE-ASMT-SCHEDULE"]) edit(dir, id, "status: draft", "status: approved");
  git(dir, "commit", "-q", "-am", "approve");
  const l3 = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.equal(l3.code, 1);
  assert.match(l3.out, /error CORE007 \[BEH-ASMT-SCHEDULE\] Approved behavior BEH-ASMT-SCHEDULE is not verified/);
  assert.match(l3.out, /Evidence: 0 run records from no evidence files/);
});

test("BEH-EVIDENCE-IMPORT: evidence import lists unmatched selectors, reads node:test TAP, and refuses what it must", async (t) => {
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

test("BEH-EVIDENCE-IMPORT: evidence import outside a git repository refuses: evidence must name a commit", async (t) => {
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
  unpinKnowledge(dir);
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
    /### BEH-ASMT-SCHEDULE: Schedule a student assessment\n\n- Changed: src\/features\/assessment\/schedule\/domain\/policies\/release-time\.ts is claimed by SLICE-ASMT-SCHEDULE, which implements it/,
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

test("BEH-REVIEW-DRIFT: review lists a slice whose code changed while none of its records did, and --fail-on-drift fails on it", async (t) => {
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

test("BEH-REVIEW-DRIFT: review lists no drift when a record describing the slice changed with its code, or when nothing it claims as code did", async (t) => {
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

test("BEH-CONTEXT: context of a file a slice claims is that slice's context, and of an unclaimed file a CORE003", async (t) => {
  const dir = await withSources(t);
  const context = await run(dir, "context", POLICY);
  assert.equal(context.code, 0, context.err);
  assert.match(context.out, /^# Context for SLICE-ASMT-SCHEDULE$/m);
  assert.match(context.out, new RegExp(`${POLICY.replaceAll(".", "\\.")} is claimed by SLICE-ASMT-SCHEDULE`));
  assert.match(context.out, /### BEH-ASMT-SCHEDULE: Schedule a student assessment/);

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
  assert.match(review.out, /Publication readiness: 1 active knowledge artifact checked/);
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

test("BEH-PUBLISH: publish from the example with its knowledge demoted to a draft publishes nothing and says why", async (t) => {
  const dir = await example(t);
  draftKnowledge(dir);
  const published = await run(dir, "publish", ...REQUEST, "--out", "published");
  assert.equal(published.code, 0, published.out + published.err);
  assert.match(
    published.out,
    /^Published 0 documents for a customer projection: audience teacher, PRD-LANTERN pilot-1/m,
  );
  assert.match(published.out, /Excluded, among what this projection may see \(draft 1\)/);
  const index = JSON.parse(readFileSync(join(dir, "published", "index.json"), "utf8"));
  assert.deepEqual(index.published, []);
  assert.deepEqual(readdirSync(join(dir, "published")).sort(), ["chunks.jsonl", "help.json", "index.json"]);
  const help = JSON.parse(readFileSync(join(dir, "published", "help.json"), "utf8"));
  assert.equal(help.profile, "intentset/help/0.2");
  assert.deepEqual(help.tips, {});
});

test("BEH-PUBLISH: publish writes reviewed knowledge with provenance, HTML, an index, a help file and chunks, naming no internal source", async (t) => {
  const dir = await example(t);
  const published = await run(dir, "publish", ...REQUEST, "--html", "--out", "out/kb");
  assert.equal(published.code, 0, published.out + published.err);
  assert.match(published.out, /^Published 1 document .*\n {2}KB-ASMT-SCHEDULE$/m);
  const out = join(dir, "out", "kb");
  assert.deepEqual(readdirSync(out).sort(), [
    "KB-ASMT-SCHEDULE.html",
    "KB-ASMT-SCHEDULE.md",
    "chunks.jsonl",
    "help.json",
    "index.json",
  ]);
  const markset = readFileSync(join(out, "KB-ASMT-SCHEDULE.md"), "utf8");
  assert.match(markset, /intentset\/publication\/0\.2/);
  for (const internal of ["Schedule a student assessment", "Require a future release time", "BEH-ASMT-SCHEDULE.md"]) {
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

test("BEH-PUBLISH: publish refuses a graph that does not validate, and a request missing a dimension", async (t) => {
  const dir = await example(t);
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

test("BEH-EXPORT, BEH-READ-EXPORT: graph --report all at L3 writes every report at the commit, and a consumer's reader accepts it", async (t) => {
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
  // The knowledge's review pins name the rule, as publication §3 requires and export §2 carries (issue #49).
  const outsidePins = JSON.stringify({
    ...envelope,
    artifacts: envelope.artifacts.map((artifact) => ({ ...artifact, extensions: null })),
  });
  assert.ok(!outsidePins.includes("RULE-ASMT-AUTH"), "the restricted rule appears nowhere but the review pins");

  const everything = await run(dir, "graph", "--report", "knowledge", "--include-restricted");
  assert.equal(everything.code, 0, everything.err);
  assert.ok(everything.out.includes("RULE-ASMT-AUTH"));
  assert.deepEqual(JSON.parse(everything.out).withholding.visibilities, []);
});

test("BEH-EXPORT: graph refuses a report its level does not read, and a report it does not know", async (t) => {
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

/** Import the one vitest report into `out`, with the options a test names. */
async function importRun(dir: string, out: string, ...more: string[]) {
  write(dir, { "reports/vitest.json": vitestReport("passed") });
  return run(dir, "evidence", "import", "--from", "vitest", "reports/vitest.json", "--out", out, ...IMPORT, ...more);
}

const verificationLine = (out: string) => out.split("\n").find((line) => line.startsWith("  TEST-ASMT-SCHEDULE")) ?? "";

test("BEH-EVIDENCE-IMPORT: --binding commit writes the records of before, and a later commit makes them stale", async (t) => {
  const dir = await committed(t);
  const imported = await importRun(dir, ".intentset/evidence/commit.json", "--binding", "commit");
  assert.equal(imported.code, 0, imported.err);
  assert.match(imported.out, /binding: commit, as configured\. Each record is current only at that commit/);
  const [record] = JSON.parse(readFileSync(join(dir, ".intentset", "evidence", "commit.json"), "utf8"));
  assert.equal("binding" in record, false);
  assert.equal("subjectHash" in record, false);

  // Judged by the default, a commit-binding record is stale at once, with a note; judged by commit it is current.
  const bySubject = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(
    verificationLine(bySubject.out),
    /stale {2}\[subject\] {2}\(latest record is bound to commit [0-9a-f]{9}, not to a subject/,
  );
  const byCommit = await run(dir, "validate", "--level", "L3", ...IMPORT, "--binding", "commit");
  assert.match(verificationLine(byCommit.out), /current-pass {2}\[commit\]$/);
  assert.match(byCommit.out, /^Binding: commit, as configured/m);

  edit(dir, "OUT-PREPARE", "teachers spend less time", "teachers spend much less time");
  git(dir, "commit", "-q", "-am", "reword an outcome");
  const later = await run(dir, "validate", "--level", "L3", ...IMPORT, "--binding", "commit");
  assert.match(verificationLine(later.out), /stale {2}\[commit\]/);
});

test("BEH-EVIDENCE-CURRENT: the configuration's binding and the --binding option, and an unknown binding is refused", async (t) => {
  const dir = await committed(t);
  const config = join(dir, ".intentset", "config.yaml");
  writeFileSync(config, `${readFileSync(config, "utf8")}evidence:\n  binding: commit\n`);
  git(dir, "commit", "-q", "-am", "ask for commit binding");
  const asked = await importRun(dir, ".intentset/evidence/a.json");
  assert.match(asked.out, /binding: commit, as configured/);
  assert.equal("binding" in JSON.parse(readFileSync(join(dir, ".intentset", "evidence", "a.json"), "utf8"))[0], false);
  const overridden = await importRun(dir, ".intentset/evidence/b.json", "--binding", "subject");
  assert.match(overridden.out, /binding: subject \(as configured\)/);
  assert.equal(JSON.parse(readFileSync(join(dir, ".intentset", "evidence", "b.json"), "utf8"))[0].binding, "subject");

  const refused = await run(dir, "validate", "--level", "L3", "--binding", "graph");
  assert.equal(refused.code, 2);
  assert.match(refused.err, /--binding graph: the bindings are subject and commit/);
});

test("BEH-EVIDENCE-CURRENT: a repository with no slice claims is judged by commit and EVID004 says so; choosing commit is silent", async (t) => {
  const dir = await committed(t);
  for (const id of ["SLICE-ASMT-SCHEDULE"]) {
    const file = RECORD(dir, id);
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(/ {4}claims:\n(?: {4}- [^\n]*\n {6}[^\n]*\n)+/, "    claims: []\n"),
    );
  }
  git(dir, "commit", "-q", "-am", "claim nothing");
  const imported = await importRun(dir, ".intentset/evidence/run.json");
  assert.match(imported.out, /binding: commit; no slice claims files, so there is no subject to bind to \(EVID004\)/);
  const [record] = JSON.parse(readFileSync(join(dir, ".intentset", "evidence", "run.json"), "utf8"));
  assert.equal("binding" in record, false);
  const l3 = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(l3.out, /warning EVID004 /);
  assert.match(l3.out, /^Binding: commit, because no slice claims files/m);
  assert.match(verificationLine(l3.out), /current-pass {2}\[commit\]$/);
  const chosen = await run(dir, "validate", "--level", "L3", ...IMPORT, "--binding", "commit");
  assert.doesNotMatch(chosen.out, /EVID004/);
});

test("BEH-EVIDENCE-CURRENT: global inputs, and the part named when a subject record goes stale", async (t) => {
  const dir = await committed(t);
  const config = join(dir, ".intentset", "config.yaml");
  writeFileSync(config, `${readFileSync(config, "utf8")}evidence:\n  globalInputs:\n    - pnpm-lock.yaml\n`);
  write(dir, { "pnpm-lock.yaml": "lock 1\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "a lockfile that every check depends on");
  const imported = await importRun(dir, ".intentset/evidence/run.json");
  assert.equal(imported.code, 0, imported.err);
  assert.match(
    verificationLine((await run(dir, "validate", "--level", "L3", ...IMPORT)).out),
    /current-pass {2}\[subject\]/,
  );

  write(dir, { "pnpm-lock.yaml": "lock 2\n" });
  git(dir, "commit", "-q", "-am", "bump a dependency");
  const stale = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(
    verificationLine(stale.out),
    /stale {2}\[subject\] {2}\(the subject changed since the run at commit [0-9a-f]{9}: global-input pnpm-lock\.yaml\)$/,
  );

  // A claimed file of the slice the behavior belongs to, and the test file, are named the same way.
  const again = await importRun(dir, ".intentset/evidence/run-2.json");
  assert.equal(again.code, 0, again.err);
  write(dir, {
    [TEST_FILE]: `import { test } from "vitest";\ntest(${JSON.stringify(TITLE)}, () => { /* edited */ });\n`,
  });
  git(dir, "commit", "-q", "-am", "edit the test");
  const both = await run(dir, "validate", "--level", "L3", ...IMPORT, "--evidence", ".intentset/evidence/run-2.json");
  assert.match(
    verificationLine(both.out),
    new RegExp(
      `stale {2}\\[subject\\] {2}\\(the subject changed since the run at commit [0-9a-f]{9}: .*test ${TEST_FILE.replaceAll(".", "\\.")}`,
    ),
  );
});

test("BEH-EVIDENCE-CURRENT: EVID005 lists a file changed since the run that no slice, resource or global input names", async (t) => {
  const dir = await committed(t);
  await importRun(dir, ".intentset/evidence/run.json");
  write(dir, { "scripts/release.sh": "echo release\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "a script nothing claims");
  const l3 = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(
    l3.out,
    /warning EVID005 .*1 file changed since the commit of a subject-bound record.*: scripts\/release\.sh\./,
  );
  assert.match(verificationLine(l3.out), /current-pass {2}\[subject\]/, "the script cannot make the evidence stale");

  // A file a claim covers is not listed: it moved the subject instead, and the record says which part.
  write(dir, { [`${TEST_FILE.replace("schedule.test.ts", "")}new-code.ts`]: "export const x = 1;\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "a file a claim covers");
  const stale = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.doesNotMatch(stale.out, /EVID005/);
  assert.match(
    verificationLine(stale.out),
    /stale {2}\[subject\] {2}\(the subject changed since the run at commit [0-9a-f]{9}: slice-file .*new-code\.ts/,
  );
});

test("BEH-EVIDENCE-CURRENT: a resource a slice lists is not in the subject unless exercised; EVID006 says what that cannot see", async (t) => {
  const dir = await committed(t);
  await importRun(dir, ".intentset/evidence/run.json");
  write(dir, { "amplify/data/resource.ts": "export const data = 2;\n" });
  git(dir, "commit", "-q", "-am", "the data resource changes");

  // SLICE-ASMT-SCHEDULE lists RES-ASSESSMENT-DATA and the test does not exercise it: the record stays current, and EVID006 says so.
  const unexercised = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(verificationLine(unexercised.out), /current-pass {2}\[subject\]/);
  assert.match(
    unexercised.out,
    /warning EVID006 .*1 verification is current though a resource it uses and does not exercise changed.*RES-ASSESSMENT-DATA \(amplify\/data\/resource\.ts\); TEST-ASMT-SCHEDULE\./,
  );
  assert.doesNotMatch(unexercised.out, /EVID005/, "EVID006 already lists the file");

  // evidence.resources: used hashes every resource a slice lists, so the same change makes the record stale, and says which file.
  const config = join(dir, ".intentset", "config.yaml");
  const before = readFileSync(config, "utf8");
  writeFileSync(config, `${before}evidence:\n  resources: used\n`);
  const used = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(verificationLine(used.out), /stale {2}\[subject\]/, "the record was made under the default");
  writeFileSync(config, before);

  // Exercising the resource puts its files in the subject: a change then makes the record stale, and names the file.
  const named = RECORD(dir, "TEST-ASMT-SCHEDULE");
  writeFileSync(
    named,
    readFileSync(named, "utf8").replace(/( {4}locator: [^\n]*\n)/, "$1    exercises:\n      - RES-ASSESSMENT-DATA\n"),
  );
  git(dir, "commit", "-q", "-am", "the test exercises the data resource");
  const imported = await importRun(dir, ".intentset/evidence/run-2.json");
  assert.equal(imported.code, 0, imported.err);
  write(dir, { "amplify/data/resource.ts": "export const data = 3;\n" });
  git(dir, "commit", "-q", "-am", "the data resource changes again");
  const exercised = await run(
    dir,
    "validate",
    "--level",
    "L3",
    ...IMPORT,
    "--evidence",
    ".intentset/evidence/run-2.json",
  );
  assert.match(
    verificationLine(exercised.out),
    /stale {2}\[subject\] {2}\(the subject changed since the run at commit [0-9a-f]{9}: .*resource-file amplify\/data\/resource\.ts/,
  );
  assert.doesNotMatch(exercised.out, /EVID006/);
});

test("BEH-EXPORT: where subject binding is in force the export states the repository's verdict and carries the binding", async (t) => {
  const dir = await committed(t);
  await importRun(dir, ".intentset/evidence/run.json");
  const exportEvidence = async () => {
    const out = await run(
      dir,
      "graph",
      "--level",
      "L3",
      "--release",
      "PRD-LANTERN:pilot-1",
      "--report",
      "evidence",
      "--generated-at",
      "2026-10-14T00:00:00Z",
    );
    assert.equal(readExport(out.out).ok, true, "a consumer's reader accepts it");
    return JSON.parse(out.out);
  };
  const atCommit = await exportEvidence();
  const report = atCommit.reports.evidence;
  assert.equal(report.binding, "subject");
  assert.equal(report.bindingReason, "default");
  const first = report.verifications[0];
  assert.equal(first.status, "current-pass");
  assert.equal(first.binding, "subject");
  assert.match(first.subject, /^[0-9a-f]{64}$/);
  assert.equal(first.latest.binding, "subject");
  assert.equal(
    first.latest.subjectHash,
    first.subject,
    "the record is current because it names the subject the report names",
  );
  assert.match(first.note, /judged by subject binding/);

  // An unrelated commit: the repository's own check keeps the record current, and so does the export, which no longer
  // classifies by commit: the record is at an older commit and graph hash than the snapshot.
  edit(dir, "OUT-PREPARE", "teachers spend less time", "teachers spend much less time");
  git(dir, "commit", "-q", "-am", "reword an outcome");
  const validated = await run(dir, "validate", "--level", "L3", ...IMPORT);
  assert.match(verificationLine(validated.out), /current-pass {2}\[subject\]/);
  const later = await exportEvidence();
  const entry = later.reports.evidence.verifications[0];
  assert.equal(entry.status, "current-pass");
  assert.notEqual(entry.latest.commit, later.source.commit);
  assert.notEqual(entry.latest.graphHash, later.graphHash);
  assert.equal(entry.subject, first.subject, "an unrelated commit leaves the subject as it was");

  // A change to a file a claim covers moves the subject: stale, with the part named, as the repository's check says.
  write(dir, { [`${TEST_FILE.replace("schedule.test.ts", "")}new-code.ts`]: "export const x = 1;\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "a file a claim covers");
  const moved = (await exportEvidence()).reports.evidence.verifications[0];
  assert.equal(moved.status, "stale");
  assert.notEqual(moved.subject, first.subject);
  assert.notEqual(moved.latest.subjectHash, moved.subject);
  assert.match(moved.note, /the subject changed since the run at commit [0-9a-f]{9}: slice-file .*new-code\.ts/);
});

test("BEH-EXPORT: a repository that asks for commit binding says so, and carries no subject", async (t) => {
  const dir = await committed(t);
  const out = await run(
    dir,
    "graph",
    "--level",
    "L3",
    "--binding",
    "commit",
    "--report",
    "evidence",
    "--generated-at",
    "2026-10-14T00:00:00Z",
  );
  const report = JSON.parse(out.out).reports.evidence;
  assert.equal(report.binding, "commit");
  assert.equal(report.bindingReason, "configured");
  assert.equal(report.verifications[0].binding, "commit");
  assert.equal(report.verifications[0].subject, null);
  assert.equal(readExport(out.out).ok, true);
});

test("BEH-EVIDENCE-CURRENT: changedSince is one diff against the working tree, and null for a commit that is not an ancestor", async (t) => {
  const dir = await committed(t);
  const first = git(dir, "rev-parse", "HEAD");
  write(dir, { "a.txt": "one\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "add a file");
  write(dir, { "b.txt": "two\n" });
  assert.deepEqual(changedSince(dir, first), ["a.txt", "b.txt"], "committed and untracked changes, sorted");
  assert.deepEqual(changedSince(dir, git(dir, "rev-parse", "HEAD")), ["b.txt"]);
  assert.equal(changedSince(dir, "0".repeat(40)), null, "no such commit");
  git(dir, "checkout", "-q", "-b", "side", first);
  write(dir, { "c.txt": "three\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "a side commit");
  const side = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "-");
  assert.equal(changedSince(dir, side), null, "a commit on another branch is not an ancestor of HEAD");
  assert.equal(changedSince(temp(t), first), null, "not a git repository");
});

const staleOf = async (dir: string, ...more: string[]) => run(dir, "evidence", "stale", ...IMPORT_SCOPE, ...more);
const IMPORT_SCOPE = ["--release", "PRD-LANTERN:pilot-1"];
const SCHEDULE_DIR = TEST_FILE.replace("schedule.test.ts", "");

test("BEH-EVIDENCE-STALE: evidence stale lists what has no current pass, then what a change moved, and writes nothing", async (t) => {
  const dir = await committed(t);

  // No run yet: the verification is missing, and a runner is given exactly its test.
  const missing = await staleOf(dir);
  assert.equal(missing.code, 0, "without --check it exits 0 whatever it finds");
  assert.match(missing.out, /^Binding: subject \(the default, since slices claim files\)$/m);
  assert.match(
    missing.out,
    new RegExp(`^${TEST_FILE.replaceAll(".", "\\.")}\\n {2}missing {2}schedule-review-v1 {2}TEST-ASMT-SCHEDULE$`, "m"),
  );
  assert.match(missing.out, /^1 of 1 automated verification need a run: missing 1\.$/m);
  assert.equal((await staleOf(dir, "--check")).code, 1, "--check is the gate's `evidence is current` test");
  const playwright = await staleOf(dir, "--format", "playwright");
  assert.equal(playwright.out, `--grep schedule-review-v1 ${TEST_FILE}\n`);
  assert.match(playwright.err, /^1 of 1 automated verification need a run: missing 1\./m);
  assert.equal((await staleOf(dir, "--format", "vitest")).out, `${TEST_FILE} -t schedule-review-v1\n`);
  assert.equal(
    (await staleOf(dir, "--format", "node-test")).out,
    `--test-name-pattern=schedule-review-v1 ${TEST_FILE}\n`,
  );

  // A run makes it current; an empty line is what a runner format prints, so `$(...)` is safe, and --check passes.
  const imported = await importRun(dir, ".intentset/evidence/run.json");
  assert.equal(imported.code, 0, imported.err);
  for (const format of ["playwright", "vitest", "node-test"]) {
    const none = await staleOf(dir, "--format", format, "--check");
    assert.equal(none.code, 0);
    assert.equal(none.out, "\n");
    assert.match(none.err, /^0 of 1 automated verification need a run\./m);
  }
  assert.match((await staleOf(dir)).out, /^Nothing automated needs a run\.$/m);

  // A commit nothing claims moves no subject.
  write(dir, { "scripts/release.sh": "echo release\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "a script nothing claims");
  assert.equal((await staleOf(dir, "--check")).code, 0);

  // A claimed file changes: stale, and the note names the part that moved.
  write(dir, { [`${SCHEDULE_DIR}new-code.ts`]: "export const x = 1;\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "a file a claim covers");
  const stale = await staleOf(dir, "--check");
  assert.equal(stale.code, 1);
  assert.match(
    stale.out,
    new RegExp(
      `^${TEST_FILE.replaceAll(".", "\\.")}\\n {2}stale {2}schedule-review-v1 {2}TEST-ASMT-SCHEDULE\\n {4}the subject changed since the run at commit [0-9a-f]{9}: slice-file .*new-code\\.ts`,
      "m",
    ),
  );
  assert.match(stale.out, /^1 of 1 automated verification need a run: stale 1\.$/m);

  const first = await staleOf(dir, "--format", "json");
  const again = await staleOf(dir, "--json");
  assert.equal(first.code, 0);
  assert.equal(first.out, again.out, "the same bytes twice, --json being --format json");
  const report = JSON.parse(first.out);
  assert.deepEqual(Object.keys(report), ["binding", "counts", "manual", "needRun", "snapshot"]);
  assert.equal(report.binding, "subject");
  assert.equal(report.snapshot.commit, git(dir, "rev-parse", "HEAD"));
  assert.deepEqual(report.manual, []);
  assert.equal(report.counts.byStatus.stale, 1);
  const { note, ...entry } = report.needRun[0];
  assert.deepEqual(entry, {
    locator: TEST_FILE,
    selector: "schedule-review-v1",
    status: "stale",
    verification: "TEST-ASMT-SCHEDULE",
  });
  assert.match(note, /: slice-file .*new-code\.ts/);

  // Under commit binding the record, a subject record, is not current either, and the line says which binding judged.
  const byCommit = await staleOf(dir, "--binding", "commit");
  assert.match(byCommit.out, /^Binding: commit, as configured$/m);
  assert.match(byCommit.out, /stale {2}schedule-review-v1/);

  // Never writes: every file, git's included, is as it was after every format has run.
  const before = snapshot(dir);
  for (const format of ["list", "json", "playwright", "vitest", "node-test"]) await staleOf(dir, "--format", format);
  const after = snapshot(dir);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [path, was] of before) assert.deepEqual(after.get(path), was, `${path} was not touched`);
});

test("BEH-EVIDENCE-STALE: a manual verification is listed apart and never needs a run, and usage errors exit 2", async (t) => {
  const dir = await example(t);
  const listed = await staleOf(dir);
  assert.equal(listed.code, 0);
  assert.match(listed.out, /^Nothing automated needs a run\.$/m);
  assert.match(
    listed.out,
    /^Manual, not re-run by a runner \(1\):\n {2}TEST-ASMT-SCHEDULE {2}missing {2}examples\/scheduling\/TEST-ASMT-SCHEDULE\.md$/m,
  );
  assert.equal((await staleOf(dir, "--check")).code, 0, "a person's review is not something a runner re-runs");
  const report = JSON.parse((await staleOf(dir, "--json")).out);
  assert.deepEqual(report.needRun, []);
  assert.equal(report.manual[0].verification, "TEST-ASMT-SCHEDULE");
  assert.equal(report.counts.manual, 1);

  for (const [argv, message] of [
    [["--format", "xml"], /--format xml: the formats are list, json, playwright, vitest, node-test/],
    [["--json", "--format", "vitest"], /--json is --format json/],
    [["--release", "PRD-LANTERN"], /give a product and a release label as <product>:<label>/],
    [["--release", "PRD-NOPE:pilot-1"], /PRD-NOPE, which is not a product in this graph/],
    [["--level", "L2"], /evidence is judged at L3 and above/],
    [["--out", "x.json"], /--out is not an option of evidence stale/],
    [["--binding", "graph"], /--binding graph: the bindings are subject and commit/],
    [["extra"], /unexpected argument "extra"/],
  ] as const) {
    const refused = await run(dir, "evidence", "stale", ...argv);
    assert.equal(refused.code, 2, `${argv.join(" ")}: ${refused.out}`);
    assert.match(refused.err, message);
  }
  const alone = await run(dir, "evidence");
  assert.equal(alone.code, 2);
  assert.match(alone.err, /the subcommands are "evidence import" and "evidence stale"/);
  const stray = await run(dir, "evidence", "import", "r.json", "--from", "vitest", "--check");
  assert.equal(stray.code, 2);
  assert.match(stray.err, /--check is not an option of evidence import/);
  const missingRoot = await run(temp(t), "evidence", "stale");
  assert.equal(missingRoot.code, 2);
});
