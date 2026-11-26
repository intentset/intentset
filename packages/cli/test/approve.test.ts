/** `intentset approve` and the approvals `intentset review` lists (Core §7 and §10, ADR 0022). */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { atEarlier, edit, example, git, RECORD, run, snapshot } from "./helpers.ts";

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
  assert.match(
    approved.out,
    /KB-ASMT-SCHEDULE .*\(reviewed: 3 sources pinned, content-v1, own text and gates pinned\)/,
  );
  const after = read(dir, "KB-ASMT-SCHEDULE");
  assert.match(after, / {2}reviewedBy: "ana\.reyes"\n {2}reviewedAt: "2026-11-24"\n/);
  for (const pin of reviewed.matchAll(/^ {6}([A-Z-]+): '?([0-9a-f]{64})'?$/gm)) {
    assert.ok(after.includes(`      ${pin[1]}: "${pin[2]}"`), `${pin[1]} is pinned at the hash the example reviewed`);
  }
  assert.equal(after.match(/^ {2}review:$/gm)?.length, 1, "the stale review is replaced");
  // ADR 0025: the review names no hash, which means content-v1.
  assert.match(after, /\n {2}review:\n {4}sources:\n/);
  assert.doesNotMatch(after, /hash:/);
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
  assert.match(refused.err, /CORE012/);

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
  assert.match(none.out, /^## Approvals, reviews and status changes \(0\)$/m);

  assert.equal((await run(dir, "approve", "RULE-ASMT-FUTURE", ...BY)).code, 0);
  // A status moved by hand, with no approval: the report shows it the same way.
  edit(dir, "RULE-ASMT-AUTH", "status: draft", "status: approved");
  // An edit that touches neither is not listed.
  edit(dir, "BEH-ASMT-SCHEDULE", "revision: 1", "revision: 2");
  git(dir, "commit", "-q", "-am", "two approvals and an edit");

  const review = await run(dir, "review", "--base", "HEAD~1");
  const section = review.out.slice(review.out.indexOf("## Approvals, reviews and status changes"));
  assert.match(section, /^## Approvals, reviews and status changes \(2\)$/m);
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

for (const version of ["0.2", "0.1"]) {
  test(`BEH-REVIEW-APPROVALS: review reads a base at ${version} as migrated, so a record the move changed in no other way is not listed`, async (t) => {
    const { dir, files } = await atEarlier(t, version);
    assert.equal((await run(dir, "migrate", "--to", "0.3")).code, 0);
    // In the same change as the move, one status moved and one other edit.
    edit(dir, "RULE-ASMT-AUTH", "status: draft", "status: approved");
    edit(dir, "BEH-ASMT-SCHEDULE", "revision: 1", "revision: 2");
    git(dir, "commit", "-q", "-am", "migrated, with one status moved");

    const review = await run(dir, "review", "--base", "HEAD~1");
    assert.match(review.out, new RegExp(`^- Changed: ${files.length} files`, "m"), "every record changed");
    const section = review.out.slice(review.out.indexOf("## Approvals, reviews and status changes"));
    assert.match(section, /^## Approvals, reviews and status changes \(1\)$/m);
    assert.match(section, /^- RULE-ASMT-AUTH \(rule\): draft -> approved; no approval stated$/m);
    assert.doesNotMatch(section, /new, /, "no record reads as new because the base was at an earlier version");

    const json = JSON.parse((await run(dir, "review", "--base", "HEAD~1", "--json")).out);
    assert.deepEqual(
      json.statusChanges.map((item: { id: string; from: string; to: string }) => [item.id, item.from, item.to]),
      [["RULE-ASMT-AUTH", "draft", "approved"]],
    );
  });
}

test("BEH-APPROVE: approve replaces a review left under the extension 0.2 read, and drops extensions left empty", async (t) => {
  const dir = await committed(t);
  edit(dir, "KB-ASMT-SCHEDULE", "status: approved", "status: draft");
  edit(
    dir,
    "KB-ASMT-SCHEDULE",
    /\n {2}review:\n(?: {4,}.*\n)+/,
    "\n  extensions:\n    intentset.org/review:\n      sources: {}\n",
  );
  git(dir, "commit", "-q", "-am", "a draft whose review is the retired extension");
  assert.equal((await run(dir, "validate")).code, 1, "the extension is CORE001 at 0.3");

  const approved = await run(dir, "approve", "KB-ASMT-SCHEDULE", ...BY);
  assert.equal(approved.code, 0, approved.err);
  const after = read(dir, "KB-ASMT-SCHEDULE");
  assert.doesNotMatch(after, /extensions:|intentset\.org\/review/);
  assert.match(
    after,
    /\n {2}review:\n {4}sources:\n(?: {6}[A-Z-]+: "[0-9a-f]{64}"\n){3} {4}self: "[0-9a-f]{64}"\n {4}gates: "[0-9a-f]{64}"\n---/,
  );
  const ready = JSON.parse((await run(dir, "validate", "--level", "L4", "--json")).out);
  assert.deepEqual(
    ready.diagnostics.filter((d: { code: string }) => ["CORE001", "CORE008", "CORE010"].includes(d.code)),
    [],
    "well formed, and current against its sources",
  );
});

test("BEH-APPROVE: approve --renew-review rewrites only the review of approved knowledge, leaving its status and approval", async (t) => {
  const dir = await committed(t);
  // The knowledge was approved by a person, and a source it explains changed since its review.
  edit(
    dir,
    "KB-ASMT-SCHEDULE",
    "  status: approved\n",
    '  status: approved\n  approval:\n    at: "2026-10-11"\n    basis: direct\n    by: "team-lead"\n',
  );
  edit(dir, "BEH-ASMT-SCHEDULE", "revision: 1", "revision: 2");
  git(dir, "commit", "-q", "-am", "an approved article whose source changed");
  const stale = await run(dir, "validate", "--level", "L4", "--json");
  assert.ok(
    JSON.parse(stale.out).diagnostics.some(
      (d: { code: string; artifact: string }) => d.code === "CORE008" && d.artifact === "KB-ASMT-SCHEDULE",
    ),
    "it needs review",
  );
  const before = read(dir, "KB-ASMT-SCHEDULE");

  const renewed = await run(dir, "approve", "KB-ASMT-SCHEDULE", "--renew-review", ...BY);
  assert.equal(renewed.code, 0, renewed.err);
  assert.match(renewed.out, /renewed the review of 1 record by ana\.reyes at 2026-11-24, checked at L1/);
  assert.match(renewed.out, /KB-ASMT-SCHEDULE .*\(reviewed: 3 sources pinned, content-v1, own text and gates pinned\)/);
  const after = read(dir, "KB-ASMT-SCHEDULE");
  const strip = (text: string) =>
    text.replace(/^ {2}reviewed(By|At): .*\n/gm, "").replace(/\n {2}review:\n(?: {4,}.*\n)+/, "\n");
  assert.equal(strip(after), strip(before), "no line but the review changed");
  assert.match(
    after,
    / {2}status: approved\n {2}approval:\n {4}at: "2026-10-11"\n {4}basis: direct\n {4}by: "team-lead"\n/,
  );
  assert.match(after, / {2}reviewedBy: "ana\.reyes"\n {2}reviewedAt: "2026-11-24"\n/);
  assert.match(
    after,
    /\n {2}review:\n {4}sources:\n(?: {6}[A-Z-]+: "[0-9a-f]{64}"\n){3} {4}self: "[0-9a-f]{64}"\n {4}gates: "[0-9a-f]{64}"\n---/,
  );
  assert.equal(git(dir, "status", "--porcelain").split("\n").length, 1, "one file changed, and nothing was committed");
  assert.deepEqual(
    JSON.parse((await run(dir, "validate", "--level", "L4", "--json")).out).diagnostics.filter(
      (d: { artifact: string }) => d.artifact === "KB-ASMT-SCHEDULE",
    ),
    [],
    "current again",
  );
  // Neither the status nor the approval changed, and the review did: review lists it as a review (ADR 0027).
  git(dir, "commit", "-q", "-am", "the review renewed");
  const review = await run(dir, "review", "--base", "HEAD~1");
  assert.match(review.out, /^## Approvals, reviews and status changes \(1\)$/m);
  assert.match(
    review.out,
    /^- KB-ASMT-SCHEDULE \(knowledge\): approved; approval \(unchanged\): direct, by team-lead, at 2026-10-11; review written or changed: ana\.reyes, 2026-11-24$/m,
  );
});

test("BEH-APPROVE: approve --renew-review takes deprecated knowledge, and skips drafts and records that are not knowledge", async (t) => {
  const dir = await committed(t);
  edit(dir, "KB-ASMT-SCHEDULE", "status: approved", "status: deprecated");
  git(dir, "commit", "-q", "-am", "a deprecated article");
  const tree = snapshot(dir);

  const dry = await run(
    dir,
    "approve",
    "KB-ASMT-SCHEDULE",
    "RULE-ASMT-FUTURE",
    "--renew-review",
    "--dry-run",
    ...BY,
    "--json",
  );
  assert.equal(dry.code, 0, dry.err);
  const result = JSON.parse(dry.out);
  assert.deepEqual(
    result.renewed.map((item: { id: string }) => item.id),
    ["KB-ASMT-SCHEDULE"],
  );
  assert.equal(result.approved, undefined);
  assert.deepEqual(result.skipped, [{ id: "RULE-ASMT-FUTURE", status: "draft", type: "rule" }]);
  assert.deepEqual(snapshot(dir), tree, "--dry-run changed nothing");

  const renewed = await run(dir, "approve", "KB-ASMT-SCHEDULE", "RULE-ASMT-FUTURE", "--renew-review", ...BY);
  assert.equal(renewed.code, 0, renewed.err);
  assert.match(
    renewed.out,
    /Skipped, not approved or deprecated knowledge \(1\):\n {2}RULE-ASMT-FUTURE {2}rule, draft/,
  );
  assert.match(read(dir, "KB-ASMT-SCHEDULE"), / {2}status: deprecated\n/);
  assert.match(read(dir, "RULE-ASMT-FUTURE"), / {2}status: draft\n/, "the draft rule is not approved");

  // A knowledge draft is approved with approve, which writes its review; the renewal skips it.
  git(dir, "commit", "-q", "-am", "renewed");
  edit(dir, "KB-ASMT-SCHEDULE", "status: deprecated", "status: draft");
  git(dir, "commit", "-q", "-am", "the article back to draft");
  const draft = await run(dir, "approve", "KB-ASMT-SCHEDULE", "--renew-review", ...BY);
  assert.equal(draft.code, 0, draft.err);
  assert.match(draft.out, /renewed the review of 0 records/);
  assert.match(draft.out, / {2}KB-ASMT-SCHEDULE {2}knowledge, draft/);
  assert.equal(git(dir, "status", "--porcelain"), "");
});

test("BEH-APPROVE: approve --renew-review refuses a bare run, a run with no --by, and a tree with uncommitted changes", async (t) => {
  const dir = await committed(t);
  const bare = await run(dir, "approve", "--renew-review", ...BY);
  assert.equal(bare.code, 2);
  assert.match(bare.err, /name the knowledge whose review to renew/);
  const anonymous = await run(dir, "approve", "KB-ASMT-SCHEDULE", "--renew-review");
  assert.equal(anonymous.code, 2);
  assert.match(anonymous.err, /--by is required: the person reviewing/);

  edit(dir, "RULE-ASMT-AUTH", "revision: 1", "revision: 2");
  const tree = snapshot(dir);
  const dirty = await run(dir, "approve", "KB-ASMT-SCHEDULE", "--renew-review", ...BY);
  assert.equal(dirty.code, 2);
  assert.match(
    dirty.err,
    /1 tracked file has uncommitted changes\. Commit or stash them so the review is a diff on its own/,
  );
  assert.deepEqual(snapshot(dir), tree);
  assert.equal((await run(dir, "approve", "KB-ASMT-SCHEDULE", "--renew-review", ...BY, "--allow-dirty")).code, 0);
});

/** The example's knowledge returned to draft and approved by ana.reyes, so its review pins its own text and gates. */
async function approvedKnowledge(t: Context): Promise<string> {
  const dir = await committed(t);
  edit(dir, "KB-ASMT-SCHEDULE", "status: approved", "status: draft");
  git(dir, "commit", "-q", "-am", "the knowledge back to draft");
  const approved = await run(dir, "approve", "KB-ASMT-SCHEDULE", ...BY);
  assert.equal(approved.code, 0, approved.err);
  git(dir, "commit", "-q", "-am", "the knowledge approved");
  return dir;
}

test("BEH-APPROVE: approve writes a self and gates that match, and an edit to the knowledge after it is CORE008 at L4", async (t) => {
  const dir = await approvedKnowledge(t);
  const after = read(dir, "KB-ASMT-SCHEDULE");
  assert.match(after, /\n {4}self: "[0-9a-f]{64}"\n {4}gates: "[0-9a-f]{64}"\n---/);
  assert.deepEqual(
    JSON.parse((await run(dir, "validate", "--level", "L4", "--json")).out).diagnostics.filter(
      (d: { code: string }) => d.code === "CORE008",
    ),
    [],
    "what approve writes matches what it pins, its own lines included",
  );
  edit(dir, "KB-ASMT-SCHEDULE", "Review the schedule before confirming.", "Check the schedule before confirming.");
  const edited = JSON.parse((await run(dir, "validate", "--level", "L4", "--json")).out).diagnostics.filter(
    (d: { code: string }) => d.code === "CORE008",
  );
  assert.equal(edited.length, 1);
  assert.equal(edited[0].field, "/intentset/review/self");
  assert.match(edited[0].message, /needs review: its own text changed since review/);
  assert.match(edited[0].remediation, /renew the review with `intentset approve`/);
});

test("BEH-REVIEW-APPROVALS: a review written by hand is listed, though no status or approval changed", async (t) => {
  const dir = await approvedKnowledge(t);
  edit(dir, "KB-ASMT-SCHEDULE", /self: "[0-9a-f]{64}"/, `self: "${"1".repeat(64)}"`);
  git(dir, "commit", "-q", "-am", "a self copied in by hand");
  const review = await run(dir, "review", "--base", "HEAD~1");
  const section = review.out.slice(review.out.indexOf("## Approvals, reviews and status changes"));
  assert.match(section, /^## Approvals, reviews and status changes \(1\)$/m);
  assert.match(section, /A review is a claim a person makes, too/);
  assert.match(
    section,
    /^- KB-ASMT-SCHEDULE \(knowledge\): approved; approval \(unchanged\): direct, by ana\.reyes, at 2026-11-24; review written or changed: ana\.reyes, 2026-11-24$/m,
  );
});

test("BEH-PUBLISH-UNDER-REVIEW: publish --keep-under-review writes a kept document under under-review/, never at the top level", async (t) => {
  const dir = await approvedKnowledge(t);
  edit(dir, "BEH-ASMT-SCHEDULE", "## Outcomes\n", "## Outcomes\n\nA second schedule for the same class is refused.\n");
  git(dir, "commit", "-q", "-am", "the behavior changed what it promises");
  const request = [
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
  const without = await run(dir, "publish", ...request, "--out", "plain");
  assert.equal(without.code, 0, without.err);
  assert.match(without.out, /Published 0 documents/);
  assert.doesNotMatch(without.out, /Kept under review/);

  const kept = await run(dir, "publish", ...request, "--keep-under-review", "--html", "--out", "kept");
  assert.equal(kept.code, 0, kept.out + kept.err);
  assert.match(kept.out, /^Kept under review \(1\), under under-review\/: KB-ASMT-SCHEDULE$/m);
  assert.match(kept.out, /^Rule tips held for review \(1\): RULE-ASMT-FUTURE$/m);
  assert.deepEqual(readdirSync(join(dir, "kept")).sort(), [
    "chunks.jsonl",
    "help.json",
    "index.json",
    "snapshot.json",
    "under-review",
  ]);
  assert.deepEqual(readdirSync(join(dir, "kept", "under-review")).sort(), [
    "KB-ASMT-SCHEDULE.html",
    "KB-ASMT-SCHEDULE.md",
  ]);
  assert.equal(readFileSync(join(dir, "kept", "chunks.jsonl"), "utf8"), "", "a kept document is never chunked");
  const index = JSON.parse(readFileSync(join(dir, "kept", "index.json"), "utf8"));
  assert.deepEqual([index.published, index.keptUnderReview], [[], ["KB-ASMT-SCHEDULE"]]);
  assert.equal(index.request.keepUnderReview, true);
  assert.match(
    readFileSync(join(dir, "kept", "under-review", "KB-ASMT-SCHEDULE.md"), "utf8"),
    /> \[!NOTE\]\n> Under review:/,
  );
});
