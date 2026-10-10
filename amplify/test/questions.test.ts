import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  defaultExcludePrefixes,
  fromItem,
  gaps,
  measure,
  renderGaps,
  renderReport,
  type StoredQuestion,
  select,
  topics,
} from "../questions/report.ts";

const core = "https://intentset.org/specifications/core/";
const guide = "https://intentset.org/guide/";

function q(overrides: Partial<StoredQuestion> & Pick<StoredQuestion, "id" | "question">): StoredQuestion {
  return {
    askedAt: "2026-10-09T12:00:00.000Z",
    conversationId: `c-${overrides.id}`,
    turn: 1,
    answer: "An answer.",
    outcome: "answered",
    sources: [core],
    contact: false,
    costMicros: 10_000,
    corpusHash: "b".repeat(64),
    ...overrides,
  };
}

const records: StoredQuestion[] = [
  q({ id: "1", question: "What is a slice?", sources: [core, guide] }),
  q({ id: "2", question: "How do I validate?", sources: [guide], askedAt: "2026-10-09T13:00:00.000Z" }),
  q({
    id: "3",
    question: "Does it support Rust?",
    outcome: "uncited",
    sources: [],
    answer: "\nThe documentation does not say.\nMore.",
  }),
  q({
    id: "4",
    question: "does it support rust",
    outcome: "uncited",
    sources: [],
    askedAt: "2026-10-09T14:00:00.000Z",
  }),
  q({ id: "5", question: "Can I talk to someone?", outcome: "contact", sources: [], contact: true }),
  q({ id: "6", question: "Something", outcome: "failed", sources: [], costMicros: 0 }),
  q({ id: "7", question: "Bad", outcome: "refused-by-model", sources: [] }),
  q({ id: "8", question: "Test", conversationId: "live-test-1" }),
  q({ id: "9", question: "Old", askedAt: "2026-09-01T00:00:00.000Z" }),
];
const window = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-10T00:00:00Z") };

test("BEH-QUESTIONS-REPORT: the window and the excluded prefixes select the records, sorted by time", () => {
  const { records: selected, excluded } = select(records, window, defaultExcludePrefixes);
  assert.equal(excluded, 1, "the live-test conversation");
  assert.deepEqual(
    selected.map((r) => r.id),
    ["1", "3", "5", "6", "7", "2", "4"],
  );
  assert.equal(select(records, window, []).records.length, 8);
});

test("MEAS-QUESTIONS-ANSWERED: answered over answered and uncited; contact, refusals and failures are not counted", () => {
  const { records: selected } = select(records, window, defaultExcludePrefixes);
  assert.deepEqual(measure(selected), { answered: 2, uncited: 2, share: 0.5 });
  assert.deepEqual(measure([]), { answered: 0, uncited: 0, share: null });
});

test("topics group by cited page, a question under each page it cited, and those citing none last", () => {
  const { records: selected } = select(records, window, defaultExcludePrefixes);
  const ts = topics(selected);
  assert.deepEqual(
    ts.map((t) => [t.source, t.records.map((r) => r.id)]),
    [
      [guide, ["1", "2"]],
      [core, ["1"]],
      [null, ["3", "5", "6", "7", "4"]],
    ],
  );
});

test("gaps group the uncited questions whatever their case and closing punctuation", () => {
  const groups = gaps(records);
  assert.deepEqual(
    groups.map((g) => g.map((r) => r.id)),
    [["3", "4"]],
  );
});

test("the report counts each outcome, the cost and the measure, and lists gaps, contact requests and failures", () => {
  const text = renderReport({
    window,
    selection: select(records, window, defaultExcludePrefixes),
    table: "intentset-ask-questions",
    excludePrefixes: defaultExcludePrefixes,
  });
  assert.match(text, /^# Questions report\n/);
  assert.match(text, /Period: 2026-10-01T00:00:00.000Z to 2026-10-10T00:00:00.000Z/);
  assert.match(text, /\(1 question left out\)/);
  assert.match(text, /- Questions: 7, in 7 conversations/);
  for (const [o, n] of [
    ["answered", 2],
    ["uncited", 2],
    ["contact", 1],
    ["refused-by-model", 1],
    ["failed", 1],
  ]) {
    assert.match(text, new RegExp(`^- ${o}: ${n}$`, "m"));
  }
  assert.match(text, /- Estimated cost: \$0\.0600/);
  assert.match(text, /MEAS-QUESTIONS-ANSWERED: 50\.0% answered with a cited source \(2 of 4; 2 uncited\)/);
  assert.match(text, /### \/guide\/ \(2\)/);
  assert.match(text, /### No source cited \(5\)/);
  assert.match(
    text,
    /- 2026-10-09T12:00:00.000Z: Does it support Rust\?\n {2}- Answer: The documentation does not say\./,
  );
  assert.match(text, /## Contact requests\n\n- 2026-10-09T12:00:00.000Z: Can I talk to someone\?/);
  assert.match(text, /failed: Something/);
  assert.match(text, /refused-by-model: Bad/);
  assert.doesNotMatch(text, /Test|Old/);
  assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"));
});

test("an empty period still renders every section", () => {
  const text = renderReport({ window, selection: { records: [], excluded: 0 }, table: "t", excludePrefixes: [] });
  assert.match(text, /Excluded conversation prefixes: none/);
  assert.match(text, /no answered or uncited questions/);
  assert.match(text, /No questions in the period\./);
});

test("a question cannot break the report's structure", () => {
  const long = `# Heading\n\n${"x".repeat(300)}`;
  const text = renderReport({
    window,
    selection: { records: [q({ id: "1", question: long, outcome: "uncited", sources: [] })], excluded: 0 },
    table: "t",
    excludePrefixes: [],
  });
  assert.doesNotMatch(text, /^# Heading/m);
  assert.match(text, /x…/);
});

test("the gaps brief groups the unanswered questions and tells the agent to draft, never invent, never copy", () => {
  const text = renderGaps({
    window,
    selection: select(records, window, defaultExcludePrefixes),
    table: "intentset-ask-questions",
    excludePrefixes: defaultExcludePrefixes,
  });
  assert.match(text, /product\/model\/knowledge\/KB-<SUBJECT>\.md/);
  assert.match(text, /`status: draft`/);
  assert.match(text, /Never invent a fact/);
  assert.match(text, /Never copy a visitor's question into the repository/);
  assert.match(text, /### 1\. Asked 2 times\n\n- Question: Does it support Rust\?/);
  assert.match(text, /corpus bbbbbbbbbbbb/);
  assert.doesNotMatch(text, /What is a slice/);
});

test("a stored item with missing or mistyped fields is read with empty values", () => {
  const r = fromItem({ id: "x", askedAt: "2026-10-09T00:00:00Z", outcome: "unknown", sources: ["a", 3], turn: "2" });
  assert.equal(r.outcome, "failed");
  assert.deepEqual(r.sources, ["a"]);
  assert.equal(r.turn, 2);
  assert.equal(r.question, "");
  assert.equal(r.costMicros, 0);
});

function run(args: string[]) {
  const home = mkdtempSync(join(tmpdir(), "questions-"));
  return {
    home,
    result: spawnSync(process.execPath, ["amplify/questions/cli.ts", ...args], {
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        AWS_CONFIG_FILE: join(home, "config"),
        AWS_SHARED_CREDENTIALS_FILE: join(home, "credentials"),
        AWS_EC2_METADATA_DISABLED: "true",
        AWS_PROFILE: "none",
      },
    }),
  };
}

test("BEH-QUESTIONS-REPORT failure: without credentials the report says so in one line, writes nothing, and exits 1", () => {
  const out = join(tmpdir(), `questions-${process.pid}-never.md`);
  const { result } = run(["--out", out]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const lines = result.stderr.trim().split("\n");
  assert.equal(lines.length, 1, result.stderr);
  assert.match(lines[0], /^questions report: cannot read intentset-ask-questions in us-east-2 .*nothing was read$/);
  assert.equal(existsSync(out), false, "no file written");
});

test("an out path inside the repository is warned about, because the repository is public", () => {
  const { result } = run(["--out", "amplify/questions/never-written.md"]);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /warning: amplify\/questions\/never-written\.md is inside the repository, which is public/,
  );
  assert.equal(existsSync("amplify/questions/never-written.md"), false);
});

test("--days is held to the retention period", () => {
  const { result } = run(["--days", "91"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--days must be 1 to 90/);
});
