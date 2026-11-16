/**
 * `formalizes` in core (Core §5, ADR 0020, BEH-FORMALIZES): a behavior, rule or scenario names the requirement
 * outside the model that it formalizes; validation checks the reference is well formed and never resolves it; the
 * content hash leaves it out; the export carries it sorted. The cases of tests/core.json, tests/publication.json and
 * tests/export.json hold the rest.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT_HASH_OMITS, exportFormalizes, FORMALIZES_TYPES, formalizedSummary, readExport } from "../src/index.ts";
import { expandCase, runCase } from "./cases.ts";

type Patch = Record<string, { frontmatter: Record<string, unknown> }>;
const lantern = (patch: Patch = {}) =>
  runCase(expandCase({ section: "core", name: "lantern", baseline: "scheduling", valid: true, patch }));
const set = (fields: Record<string, unknown>) => ({
  frontmatter: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`intentset.${k}`, v])),
});
const BEH = "BEH-ASMT-SCHEDULE.md";
const ID = "BEH-ASMT-SCHEDULE";
const ITEM = { source: "https://tracker.example/LAN-12", anchor: "criterion-3" };
const fields = (file: string, formalizes: unknown) =>
  lantern({ [file]: set({ formalizes }) })
    .diagnostics.filter((d) => d.field?.startsWith("/intentset/formalizes"))
    .map((d) => `${d.code} ${d.severity} ${d.field}`);

test("BEH-FORMALIZES: a behavior, rule or scenario names an outside requirement by source and anchor", () => {
  assert.deepEqual([...FORMALIZES_TYPES], ["behavior", "rule", "scenario"]);
  for (const file of [BEH, "RULE-ASMT-FUTURE.md", "SCN-ASMT-SCHEDULE.md"]) {
    const read = lantern({ [file]: set({ formalizes: [ITEM, { source: "LAN-12" }] }) });
    assert.deepEqual(read.diagnostics, [], file);
    assert.deepEqual(read.result.graph.artifacts.get(file.replace(".md", ""))?.meta.formalizes, [
      ITEM,
      { source: "LAN-12" },
    ]);
  }
  assert.deepEqual(fields("CAP-ASMT-ASSIGN.md", [ITEM]), ["CORE001 error /intentset/formalizes"]);
  const message = lantern({ "CAP-ASMT-ASSIGN.md": set({ formalizes: [ITEM] }) }).diagnostics[0].message;
  assert.match(message, /written on a capability; only behavior, rule and scenario records/);
});

test("BEH-FORMALIZES: a reference that is not well formed is CORE001 with its pointer, and the good entries are kept", () => {
  assert.deepEqual(fields(BEH, ITEM), ["CORE001 error /intentset/formalizes"]);
  assert.deepEqual(fields(BEH, []), ["CORE001 error /intentset/formalizes"]);
  assert.deepEqual(fields(BEH, [ITEM.source]), ["CORE001 error /intentset/formalizes/0"]);
  assert.deepEqual(fields(BEH, [{ anchor: "criterion-3" }]), ["CORE001 error /intentset/formalizes/0/source"]);
  assert.deepEqual(fields(BEH, [{ source: "" }]), ["CORE001 error /intentset/formalizes/0/source"]);
  assert.deepEqual(fields(BEH, [{ source: "LAN-12", anchor: "" }]), ["CORE001 error /intentset/formalizes/0/anchor"]);
  assert.deepEqual(fields(BEH, [{ source: "LAN-12", anchor: 3 }]), ["CORE001 error /intentset/formalizes/0/anchor"]);
  assert.deepEqual(fields(BEH, [{ ...ITEM, title: "x" }]), ["CORE001 error /intentset/formalizes/0/title"]);
  assert.deepEqual(fields(BEH, [ITEM, { ...ITEM }]), ["CORE001 error /intentset/formalizes/1"]);
  assert.deepEqual(fields(BEH, [ITEM, { source: ITEM.source }]), [], "the same source with and without an anchor");

  const kept = lantern({ [BEH]: set({ formalizes: [ITEM, { source: "" }] }) });
  assert.deepEqual(kept.result.graph.artifacts.get(ID)?.meta.formalizes, [ITEM]);
});

test("BEH-FORMALIZES: a reference is never resolved: it makes no edge, and an address nothing answers validates", () => {
  const before = lantern();
  const after = lantern({ [BEH]: set({ formalizes: [{ source: "https://tracker.invalid/no-such-item" }] }) });
  assert.deepEqual(after.diagnostics, []);
  assert.deepEqual(after.result.graph.out.get(ID), before.result.graph.out.get(ID), "no edge is added");
  assert.deepEqual(after.result.graph.in.get(ID), before.result.graph.in.get(ID));
});

test("BEH-FORMALIZES: naming or renumbering what a record formalizes leaves its content hash alone", () => {
  assert.ok((CONTENT_HASH_OMITS as readonly string[]).includes("formalizes"));
  const hashes = (formalizes?: unknown) => {
    const artifact = lantern(formalizes === undefined ? {} : { [BEH]: set({ formalizes }) }).result.graph.artifacts.get(
      ID,
    );
    assert.ok(artifact);
    return { content: artifact.contentHash, source: artifact.sourceHash };
  };
  const base = hashes();
  const named = hashes([ITEM]);
  const renumbered = hashes([{ ...ITEM, anchor: "criterion-4" }]);
  assert.equal(named.content, base.content);
  assert.equal(renumbered.content, base.content);
  assert.notEqual(named.source, base.source, "sourceHash is the whole file");
});

test("BEH-FORMALIZES: the export carries the references sorted, empty where a record names none, and readExport holds the shape", () => {
  const written = [{ source: "LAN-12", anchor: "criterion-3" }, { source: "LAN-12" }, { source: "LAN-11" }];
  const { envelope } = lantern({ [BEH]: set({ formalizes: written }) });
  const plain = JSON.parse(JSON.stringify(envelope));
  const of = (id: string) => plain.artifacts.find((a: { id: string }) => a.id === id);
  const sorted = [
    { source: "LAN-11", anchor: null },
    { source: "LAN-12", anchor: null },
    { source: "LAN-12", anchor: "criterion-3" },
  ];
  assert.deepEqual(of(ID).formalizes, sorted);
  assert.deepEqual(exportFormalizes(written), sorted);
  assert.deepEqual(of("CAP-ASMT-ASSIGN").formalizes, []);
  assert.deepEqual(sorted.map(formalizedSummary), ["LAN-11", "LAN-12", "LAN-12 (criterion-3)"]);
  assert.ok(readExport(plain).ok);

  const onCapability = structuredClone(plain);
  onCapability.artifacts.find((a: { id: string }) => a.id === "CAP-ASMT-ASSIGN").formalizes = sorted;
  const refused = readExport(onCapability);
  assert.ok(!refused.ok && refused.problems.some((p) => p.pointer.endsWith("/formalizes")));
  const repeated = structuredClone(plain);
  repeated.artifacts.find((a: { id: string }) => a.id === ID).formalizes = [sorted[0], sorted[0]];
  assert.equal(readExport(repeated).ok, false);
});
