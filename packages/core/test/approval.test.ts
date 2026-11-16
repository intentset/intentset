/**
 * `approval` in core (Core §7, ADR 0020, BEH-APPROVAL-BASIS): the basis of a record's approval is read from a record,
 * shape-checked and nothing more, left out of the content hash, and carried through the export. The cases of
 * tests/core.json, tests/publication.json and tests/export.json hold the rest.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { APPROVAL_BASES, approvalSummary, CONTENT_HASH_OMITS, exportApproval, readExport } from "../src/index.ts";
import { expandCase, runCase } from "./cases.ts";

type Patch = Record<string, { frontmatter: Record<string, unknown> }>;
const lantern = (patch: Patch = {}, level?: "L1" | "L3") =>
  runCase(
    expandCase({
      section: "core",
      name: "lantern",
      baseline: "scheduling",
      valid: true,
      patch,
      ...(level ? { level } : {}),
    }),
  );
const set = (fields: Record<string, unknown>) => ({
  frontmatter: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`intentset.${k}`, v])),
});
const BEH = "BEH-ASMT-SCHEDULE.md";
const ID = "BEH-ASMT-SCHEDULE";
const SOURCE = { ref: "https://tracker.example/LAN-12", revision: "7" };
const DIRECT = { by: "ana.reyes", at: "2026-11-14", basis: "direct" };
const DERIVED = { by: "ana.reyes", at: "2026-11-14T09:30:00Z", basis: "derived", source: SOURCE };
const ATTESTED = { at: "2026-11-14", basis: "attested", attestedBy: "drafting-agent" };
const problems = (approval: unknown) =>
  lantern({ [BEH]: set({ approval }) }).diagnostics.filter((d) => d.field?.startsWith("/intentset/approval"));

test("BEH-APPROVAL-BASIS: a record states who approved it, when, and on which of three bases", () => {
  assert.deepEqual([...APPROVAL_BASES], ["direct", "derived", "attested"]);
  for (const approval of [DIRECT, DERIVED, ATTESTED]) {
    const read = lantern({ [BEH]: set({ approval }) });
    assert.deepEqual(read.diagnostics, [], approval.basis);
    assert.deepEqual(read.result.graph.artifacts.get(ID)?.meta.approval, approval, approval.basis);
  }
  assert.equal(lantern().result.graph.artifacts.get(ID)?.meta.approval, undefined, "absent, nothing is stated");
});

test("BEH-APPROVAL-BASIS: a derived approval names its source and the revision or digest that was approved", () => {
  const digest = { ...DERIVED, source: { ref: "LAN-12", digest: "sha256:9f2c41d0" }, attestedBy: "drafting-agent" };
  assert.deepEqual(problems(digest), []);
  assert.deepEqual(problems({ ...DERIVED, source: { ...SOURCE, digest: "sha256:9f2c41d0" } }), [], "both");

  const none = problems({ by: "ana.reyes", at: "2026-11-14", basis: "derived" });
  assert.deepEqual(
    none.map((d) => [d.code, d.field]),
    [["CORE001", "/intentset/approval/source"]],
  );
  const state = problems({ ...DERIVED, source: { ref: SOURCE.ref } });
  assert.equal(state.length, 1);
  assert.match(state[0].message, /neither a revision nor a digest/);
  assert.equal(problems({ ...DERIVED, source: { revision: "7" } })[0].field, "/intentset/approval/source/ref");
});

test("BEH-APPROVAL-BASIS: each basis carries its own members, and anything else is CORE001 with its pointer", () => {
  const fields = (approval: unknown) => problems(approval).map((d) => `${d.code} ${d.severity} ${d.field}`);
  assert.deepEqual(fields("ana.reyes"), ["CORE001 error /intentset/approval"]);
  assert.deepEqual(fields({ ...DIRECT, role: "owner" }), ["CORE001 error /intentset/approval/role"]);
  assert.deepEqual(fields({ by: "ana.reyes", basis: "direct" }), ["CORE001 error /intentset/approval/at"]);
  assert.deepEqual(fields({ ...DIRECT, at: 20261114 }), ["CORE001 error /intentset/approval/at"]);
  assert.deepEqual(fields({ ...DIRECT, basis: "delegated" }), ["CORE001 error /intentset/approval/basis"]);
  assert.deepEqual(fields({ ...DIRECT, by: "" }), ["CORE001 error /intentset/approval/by"]);
  assert.deepEqual(fields({ at: "2026-11-14", basis: "direct" }), ["CORE001 error /intentset/approval/by"]);
  assert.deepEqual(fields({ ...DIRECT, source: SOURCE }), ["CORE001 error /intentset/approval/source"]);
  assert.deepEqual(fields({ ...DIRECT, attestedBy: "agent" }), ["CORE001 error /intentset/approval/attestedBy"]);
  assert.deepEqual(fields({ ...ATTESTED, by: "ana.reyes" }), ["CORE001 error /intentset/approval/by"]);
  assert.deepEqual(fields({ at: "2026-11-14", basis: "attested" }), ["CORE001 error /intentset/approval/attestedBy"]);
  assert.deepEqual(fields({ ...ATTESTED, source: SOURCE }), ["CORE001 error /intentset/approval/source"]);

  const broken = lantern({ [BEH]: set({ approval: { ...DIRECT, basis: "delegated" } }) });
  const artifact = broken.result.graph.artifacts.get(ID);
  assert.ok(artifact, "the record stays in the graph");
  assert.equal(artifact.meta.approval, undefined, "a half-read approval is not carried");
});

test("BEH-APPROVAL-BASIS: validation checks the shape only: any type, any status, any approver, and no status needs it", () => {
  const onDraft = lantern({ "MEAS-PREPARE-ADOPTION.md": set({ approval: DIRECT }) });
  assert.deepEqual(onDraft.diagnostics, [], "a draft of any type may carry one");
  const agentAsPerson = lantern({ [BEH]: set({ status: "approved", approval: { ...DIRECT, by: "drafting-agent" } }) });
  assert.deepEqual(agentAsPerson.diagnostics, [], "who may approve is never checked");
  const without = lantern({ [BEH]: set({ status: "approved" }) });
  assert.deepEqual(without.diagnostics, [], "an approved record need not state a basis");
});

test("BEH-APPROVAL-BASIS: writing or changing an approval leaves the content hash alone and moves the whole-file hash", () => {
  assert.ok((CONTENT_HASH_OMITS as readonly string[]).includes("approval"));
  const hashes = (approval?: unknown) => {
    const artifact = lantern(approval === undefined ? {} : { [BEH]: set({ approval }) }).result.graph.artifacts.get(ID);
    assert.ok(artifact);
    return { content: artifact.contentHash, source: artifact.sourceHash };
  };
  const base = hashes();
  const direct = hashes(DIRECT);
  const derived = hashes(DERIVED);
  assert.equal(direct.content, base.content, "added");
  assert.equal(derived.content, base.content, "changed");
  assert.notEqual(direct.source, base.source, "sourceHash is the whole file");
  assert.notEqual(derived.source, direct.source);
});

test("BEH-APPROVAL-BASIS: the export carries the approval with null where the basis carries no member, and readExport holds the shape", () => {
  const { envelope } = lantern({
    [BEH]: set({ approval: DERIVED }),
    "RULE-ASMT-AUTH.md": set({ approval: ATTESTED }),
    "RULE-ASMT-FUTURE.md": set({ approval: DIRECT }),
  });
  const plain = JSON.parse(JSON.stringify(envelope));
  const of = (id: string) => plain.artifacts.find((a: { id: string }) => a.id === id).approval;
  assert.deepEqual(of(ID), {
    by: "ana.reyes",
    at: "2026-11-14T09:30:00Z",
    basis: "derived",
    source: { ref: SOURCE.ref, revision: "7", digest: null },
    attestedBy: null,
  });
  assert.deepEqual(of("RULE-ASMT-AUTH"), {
    by: null,
    at: "2026-11-14",
    basis: "attested",
    source: null,
    attestedBy: "drafting-agent",
  });
  assert.deepEqual(of("RULE-ASMT-FUTURE"), { ...DIRECT, source: null, attestedBy: null });
  assert.equal(of("CAP-ASMT-ASSIGN"), null, "not stated, which is not unapproved");
  assert.equal(exportApproval(undefined), null);
  assert.ok(readExport(plain).ok);

  const refuses = (change: (approval: Record<string, unknown>) => void, pointer: RegExp) => {
    const copy = structuredClone(plain);
    change(copy.artifacts.find((a: { id: string }) => a.id === ID).approval);
    const read = readExport(copy);
    assert.ok(
      !read.ok && read.category === "malformed" && read.problems.some((p) => pointer.test(p.pointer)),
      `${pointer}`,
    );
  };
  refuses((a) => (a.source = null), /\/approval\/source$/);
  refuses((a) => (a.by = null), /\/approval\/by$/);
  refuses((a) => (a.basis = "direct"), /\/approval\/source$/);
  refuses((a) => ((a.source as Record<string, unknown>).revision = null), /\/approval\/source$/);
  refuses((a) => (a.basis = "attested"), /\/approval\/(by|attestedBy|source)$/);
});

test("BEH-APPROVAL-BASIS: an approval reads as one line that names its basis, its source and who", () => {
  assert.equal(approvalSummary(DIRECT as never), "direct, by ana.reyes, at 2026-11-14");
  assert.equal(
    approvalSummary({ ...DERIVED, attestedBy: "drafting-agent" } as never),
    "derived, from https://tracker.example/LAN-12 at revision 7, by ana.reyes, attested by drafting-agent, at 2026-11-14T09:30:00Z",
  );
  assert.equal(
    approvalSummary(exportApproval(ATTESTED as never) as never),
    "attested, attested by drafting-agent, at 2026-11-14",
  );
});
