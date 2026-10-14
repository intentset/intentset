import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";
import type { Graph } from "@intentset/core";
import {
  type Classification,
  type EvidenceStatus,
  escapeRegExp,
  RUNNER_FORMATS,
  runnerArguments,
  shellQuote,
  staleReport,
  staleSummary,
  type VerificationEvidence,
} from "../src/index.ts";

interface Spec {
  method?: "automated" | "manual";
  status?: string;
  locator: string;
  selector: string;
  evidence: EvidenceStatus;
  note?: string;
}

/** A graph of verifications and the classification of each, with nothing else a selection reads. */
function world(specs: Record<string, Spec>): { graph: Graph; classification: Classification } {
  const artifacts = new Map<string, unknown>();
  const verifications: Record<string, VerificationEvidence> = {};
  for (const [id, spec] of Object.entries(specs)) {
    artifacts.set(id, {
      meta: {
        id,
        type: "verification",
        status: spec.status ?? "draft",
        verification: { method: spec.method ?? "automated", locator: spec.locator, selector: spec.selector },
      },
    });
    verifications[id] = {
      verificationId: id,
      method: spec.method ?? "automated",
      status: spec.evidence,
      binding: "subject",
      subject: null,
      ...(spec.note === undefined ? {} : { note: spec.note }),
      latest: null,
      history: [],
      atSnapshot: { pass: 0, fail: 0, skip: 0, error: 0 },
      outOfScope: 0,
    };
  }
  return {
    graph: { artifacts } as unknown as Graph,
    classification: { verifications } as unknown as Classification,
  };
}

const SPECS: Record<string, Spec> = {
  "TEST-B": {
    locator: "b.spec.ts",
    selector: "BEH-B",
    evidence: "stale",
    note: "the subject changed: slice-file src/b.ts",
  },
  "TEST-A": { locator: "a.spec.ts", selector: "BEH-A", evidence: "missing" },
  "TEST-C": { locator: "a.spec.ts", selector: "BEH-C", evidence: "current-pass", note: "judged by subject binding" },
  "TEST-D": { locator: "a.spec.ts", selector: "BEH-D", evidence: "current-fail" },
  "TEST-E": { locator: "e.spec.ts", selector: "BEH-E", evidence: "skip", note: "judged by subject binding" },
  "TEST-F": { locator: "f.spec.ts", selector: "BEH-F", evidence: "error" },
  "TEST-G": { locator: "g.spec.ts", selector: "BEH-G", evidence: "stale", status: "retired" },
  "TEST-M": {
    method: "manual",
    locator: "docs/review.md",
    selector: "BEH-M",
    evidence: "stale",
    note: "the subject changed",
  },
  "TEST-N": { method: "manual", locator: "docs/other.md", selector: "BEH-N", evidence: "current-pass" },
};

describe("BEH-EVIDENCE-STALE: staleReport", () => {
  const { graph, classification } = world(SPECS);
  const report = staleReport(graph, classification);

  test("lists every automated verification that is not a current pass, by locator, selector and ID", () => {
    assert.deepEqual(
      report.needRun.map((entry) => [entry.locator, entry.verification, entry.status]),
      [
        ["a.spec.ts", "TEST-A", "missing"],
        ["a.spec.ts", "TEST-D", "current-fail"],
        ["b.spec.ts", "TEST-B", "stale"],
        ["e.spec.ts", "TEST-E", "skip"],
        ["f.spec.ts", "TEST-F", "error"],
      ],
    );
  });

  test("a current pass and a retired verification are not listed, and only the moved part's note is kept", () => {
    const ids = report.needRun.map((entry) => entry.verification);
    assert.equal(ids.includes("TEST-C"), false);
    assert.equal(ids.includes("TEST-G"), false);
    assert.equal(
      report.needRun.find((entry) => entry.verification === "TEST-B")?.note,
      "the subject changed: slice-file src/b.ts",
    );
    assert.equal("note" in (report.needRun.find((entry) => entry.verification === "TEST-E") ?? {}), false);
  });

  test("a manual verification is listed apart, and a current manual review is not listed", () => {
    assert.deepEqual(report.manual, [
      { verification: "TEST-M", locator: "docs/review.md", status: "stale", note: "the subject changed" },
    ]);
    assert.equal(
      report.needRun.some((entry) => entry.verification === "TEST-M"),
      false,
    );
  });

  test("counts say what each status came to, and the summary reads them", () => {
    assert.deepEqual(report.counts, {
      automated: 6,
      current: 1,
      needRun: 5,
      byStatus: { stale: 1, missing: 1, error: 1, skip: 1, "current-fail": 1, unresolved: 0 },
      manual: 1,
    });
    assert.equal(
      staleSummary(report.counts),
      "5 of 6 automated verifications need a run: current-fail 1, stale 1, skip 1, error 1, missing 1. 1 manual verification has no current review, which a runner does not re-run.",
    );
    const clean = world({ "TEST-A": { locator: "a", selector: "A", evidence: "current-pass" } });
    assert.equal(
      staleSummary(staleReport(clean.graph, clean.classification).counts),
      "0 of 1 automated verification need a run.",
    );
  });
});

describe("BEH-EVIDENCE-STALE: runnerArguments", () => {
  const entries = [
    { selector: "BEH-B", locator: "tests/b.spec.ts" },
    { selector: "BEH-A", locator: "tests/a.spec.ts" },
    { selector: "BEH-A", locator: "tests/a.spec.ts" },
  ];

  test("each runner gets its own flags, the sorted unique selectors, and the locator files", () => {
    assert.equal(runnerArguments("playwright", entries), "--grep 'BEH-A|BEH-B' tests/a.spec.ts tests/b.spec.ts");
    assert.equal(runnerArguments("vitest", entries), "tests/a.spec.ts tests/b.spec.ts -t 'BEH-A|BEH-B'");
    assert.equal(
      runnerArguments("node-test", entries),
      "--test-name-pattern=BEH-A --test-name-pattern=BEH-B tests/a.spec.ts tests/b.spec.ts",
    );
  });

  test("nothing to run is nothing", () => {
    for (const format of RUNNER_FORMATS) assert.equal(runnerArguments(format, []), "");
  });

  const TITLES = [
    "[a-1] (b) | c",
    'it\'s a "quoted" $HOME `cmd` \\ title',
    "cost $5.00 + 3*4 = ^12?",
    "path/to {x} [y] a|b",
    "/slashed/",
  ];

  test("escaping makes each selector a regular expression that matches exactly itself, and no other selector's text", () => {
    for (const title of TITLES) {
      const pattern = new RegExp(escapeRegExp(title));
      assert.ok(pattern.test(`before ${title} after`), title);
      assert.ok(new RegExp(`^${escapeRegExp(title)}$`).test(title), title);
    }
    assert.equal(
      new RegExp(TITLES.map(escapeRegExp).join("|")).test("a-1"),
      false,
      "the pattern is not read as regex syntax",
    );
    assert.equal(escapeRegExp("/x/"), "\\/x\\/", "so a pattern never reads as /re/flags");
  });

  test("what a POSIX shell hands the runner is the pattern, whatever the title holds", () => {
    const echoed = (args: string): string[] => {
      const out = spawnSync("sh", ["-c", `printf '%s\\n' ${args}`], { encoding: "utf8" });
      assert.equal(out.status, 0, out.stderr);
      return out.stdout.split("\n").slice(0, -1);
    };
    const entriesWith = TITLES.map((selector) => ({ selector, locator: "tests/it's [x] (1).spec.ts" }));
    const alternation = [...TITLES].sort().map(escapeRegExp).join("|");

    const playwright = echoed(runnerArguments("playwright", entriesWith));
    assert.deepEqual(playwright.slice(0, 2), ["--grep", alternation]);
    assert.equal(
      playwright[2],
      "tests/it's \\[x\\] \\(1\\).spec.ts",
      "a path filter is a regular expression in Playwright",
    );

    const vitest = echoed(runnerArguments("vitest", entriesWith));
    assert.deepEqual(vitest, ["tests/it's [x] (1).spec.ts", "-t", alternation]);

    const node = echoed(runnerArguments("node-test", entriesWith));
    assert.deepEqual(
      node.slice(0, TITLES.length),
      [...TITLES].sort().map((title) => `--test-name-pattern=${escapeRegExp(title)}`),
    );
    assert.equal(node[TITLES.length], "tests/it's [x] (1).spec.ts");

    // The alternation selects every title it was made from.
    for (const title of TITLES) assert.ok(new RegExp(playwright[1], "i").test(`file › ${title}`), title);
  });

  test("a word with nothing special is left bare, and a quote is closed, escaped and reopened", () => {
    assert.equal(shellQuote("tests/a.spec.ts"), "tests/a.spec.ts");
    assert.equal(shellQuote("a|b"), "'a|b'");
    assert.equal(shellQuote("it's"), "'it'\\''s'");
  });
});
