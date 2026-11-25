/** `intentset approve` and the approvals `intentset review` lists (Core §7 and §10, ADR 0022). */
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { test } from "node:test";
import { edit, example, git, RECORD, run, snapshot } from "./helpers.ts";

type Context = Parameters<typeof example>[0];

async function committed(t: Context): Promise<string> {
  const dir = await example(t);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "the example");
  return dir;
}

const read = (dir: string, id: string) => readFileSync(RECORD(dir, id), "utf8");
const BY = ["--by", "ana.reyes", "--at", "2026-11-24"];

test("BEH-APPROVE: approve writes status and a direct approval into a named draft and changes no other line", async (t) => {
  const dir = await committed(t);
  const before = read(dir, "RULE-ASMT-FUTURE");

  const approved = await run(dir, "approve", "RULE-ASMT-FUTURE", ...BY);
  assert.equal(approved.code, 0, approved.err);
  assert.match(approved.out, /approved 1 record by ana\.reyes at 2026-11-24 \(direct\), checked at L1/);
  assert.match(approved.out, /Nothing was committed/);

  const after = read(dir, "RULE-ASMT-FUTURE");
  assert.equal(
    after,
    before.replace(
      "  status: draft\n",
      '  status: approved\n  approval:\n    at: "2026-11-24"\n    basis: direct\n    by: "ana.reyes"\n',
    ),
  );
  assert.equal(git(dir, "status", "--porcelain").split("\n").length, 1, "one file changed, and nothing was committed");
  assert.equal((await run(dir, "validate")).code, 0);

  // Approved now, so a second run skips it and writes nothing.
  git(dir, "commit", "-q", "-am", "approve the rule");
  const again = await run(dir, "approve", "RULE-ASMT-FUTURE", ...BY);
  assert.equal(again.code, 0);
  assert.match(again.out, /approved 0 records/);
  assert.match(again.out, /Skipped, not drafts \(1\):\n {2}RULE-ASMT-FUTURE {2}approved/);
  assert.equal(git(dir, "status", "--porcelain"), "");
});

test("BEH-APPROVE: approve takes list's selector, replaces an earlier approval, and --dry-run writes nothing", async (t) => {
  const dir = await committed(t);
  edit(
    dir,
    "RULE-ASMT-AUTH",
    "  status: draft\n",
    "  status: draft # as drafted\n  approval:\n    at: '2026-11-01'\n    basis: attested\n    attestedBy: drafting-agent\n",
  );
  git(dir, "commit", "-q", "-am", "an attested draft");
  const tree = snapshot(dir);

  const dry = await run(dir, "approve", "--type", "rule", "--dry-run", ...BY, "--json");
  assert.equal(dry.code, 0, dry.err);
  const result = JSON.parse(dry.out);
  assert.deepEqual(
    result.approved.map((item: { id: string }) => item.id),
    ["RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"],
  );
  assert.equal(result.written, false);
  assert.deepEqual(snapshot(dir), tree, "--dry-run changed nothing");

  assert.equal((await run(dir, "approve", "--type", "rule", ...BY)).code, 0);
  const auth = read(dir, "RULE-ASMT-AUTH");
  assert.match(
    auth,
    / {2}status: approved # as drafted\n {2}approval:\n {4}at: "2026-11-24"\n {4}basis: direct\n {4}by: "ana\.reyes"\n {2}owner:/,
  );
  assert.doesNotMatch(auth, /attested/, "the earlier approval is replaced, not kept beside the new one");
  assert.equal((await run(dir, "validate")).code, 0);
});

test("BEH-APPROVE: approve gives a knowledge record its review, pinning each source's content hash", async (t) => {
  const dir = await committed(t);
  const reviewed = read(dir, "KB-ASMT-SCHEDULE");
  // A draft whose review names another reviewer and a pin that no longer holds.
  edit(dir, "KB-ASMT-SCHEDULE", "status: approved", "status: draft");
  edit(dir, "KB-ASMT-SCHEDULE", "'4fede99f", "'00000000");
  git(dir, "commit", "-q", "-am", "the knowledge as a draft");

  const approved = await run(dir, "approve", "KB-ASMT-SCHEDULE", ...BY);
  assert.equal(approved.code, 0, approved.err);
  assert.match(approved.out, /KB-ASMT-SCHEDULE .*\(reviewed: 3 sources pinned, content-v1\)/);
  const after = read(dir, "KB-ASMT-SCHEDULE");
  assert.match(after, / {2}reviewedBy: "ana\.reyes"\n {2}reviewedAt: "2026-11-24"\n/);
  for (const pin of reviewed.matchAll(/^ {8}([A-Z-]+): '?([0-9a-f]{64})'?$/gm)) {
    assert.ok(after.includes(`        ${pin[1]}: "${pin[2]}"`), `${pin[1]} is pinned at the hash the example reviewed`);
  }
  assert.equal(after.match(/intentset\.org\/review:/g)?.length, 1, "the stale review is replaced");
  const ready = await run(dir, "validate", "--level", "L4", "--mode", "strict");
  assert.doesNotMatch(ready.out, /CORE008/, "the approved knowledge is current against its sources");
});

test("BEH-APPROVE: approve writes nothing when the approval would add an error, or names no such record", async (t) => {
  const dir = await committed(t);
  rmSync(RECORD(dir, "MEAS-PREPARE-ADOPTION"));
  rmSync(RECORD(dir, "MEAS-PREPARE-MINUTES"));
  git(dir, "commit", "-q", "-am", "an outcome nothing measures");
  assert.equal((await run(dir, "validate")).code, 0, "a draft outcome with no measure is a warning");
  const tree = snapshot(dir);

  // Core §7: an outcome past draft needs a measure, so approving it would break the tree. The rule goes unwritten too.
  const refused = await run(dir, "approve", "OUT-PREPARE", "RULE-ASMT-FUTURE", ...BY);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /approving 2 records would add 1 error at L1\. Nothing was written\./);
  assert.match(refused.err, /CORE003/);

  const unknown = await run(dir, "approve", "RULE-ASMT-FUTURE", "RULE-ASMT-NONE", ...BY);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /RULE-ASMT-NONE: no such record/);
  assert.deepEqual(snapshot(dir), tree, "neither run wrote a file");
});

test("BEH-APPROVE: approve refuses a bare run, a run with no --by, and a tree with uncommitted changes", async (t) => {
  const dir = await committed(t);
  const bare = await run(dir, "approve", ...BY);
  assert.equal(bare.code, 2);
  assert.match(bare.err, /name the records to approve/);
  const anonymous = await run(dir, "approve", "RULE-ASMT-FUTURE");
  assert.equal(anonymous.code, 2);
  assert.match(anonymous.err, /--by is required/);

  edit(dir, "RULE-ASMT-AUTH", "revision: 1", "revision: 2");
  const tree = snapshot(dir);
  const dirty = await run(dir, "approve", "RULE-ASMT-FUTURE", ...BY);
  assert.equal(dirty.code, 2);
  assert.match(dirty.err, /1 tracked file has uncommitted changes/);
  assert.deepEqual(snapshot(dir), tree);
  assert.equal((await run(dir, "approve", "RULE-ASMT-FUTURE", ...BY, "--allow-dirty")).code, 0);
});

test("BEH-REVIEW-APPROVALS: review lists each record whose status or approval differs from the base", async (t) => {
  const dir = await committed(t);
  const none = await run(dir, "review", "--base", "HEAD");
  assert.match(none.out, /^## Approvals and status changes \(0\)$/m);

  assert.equal((await run(dir, "approve", "RULE-ASMT-FUTURE", ...BY)).code, 0);
  // A status moved by hand, with no approval: the report shows it the same way.
  edit(dir, "RULE-ASMT-AUTH", "status: draft", "status: approved");
  // An edit that touches neither is not listed.
  edit(dir, "BEH-ASMT-SCHEDULE", "revision: 1", "revision: 2");
  git(dir, "commit", "-q", "-am", "two approvals and an edit");

  const review = await run(dir, "review", "--base", "HEAD~1");
  const section = review.out.slice(review.out.indexOf("## Approvals and status changes"));
  assert.match(section, /^## Approvals and status changes \(2\)$/m);
  assert.match(section, /^- RULE-ASMT-AUTH \(rule\): draft -> approved; no approval stated$/m);
  assert.match(
    section,
    /^- RULE-ASMT-FUTURE \(rule\): draft -> approved; approval: direct, by ana\.reyes, at 2026-11-24$/m,
  );
  assert.doesNotMatch(section, /BEH-ASMT-SCHEDULE/);

  const json = JSON.parse((await run(dir, "review", "--base", "HEAD~1", "--json")).out);
  assert.deepEqual(
    json.statusChanges.map((item: { id: string; from: string; to: string; approval: { by: string } | null }) => [
      item.id,
      item.from,
      item.to,
      item.approval?.by ?? null,
    ]),
    [
      ["RULE-ASMT-AUTH", "draft", "approved", null],
      ["RULE-ASMT-FUTURE", "draft", "approved", "ana.reyes"],
    ],
  );
});
