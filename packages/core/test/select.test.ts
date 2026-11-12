/**
 * `select` and its readers in core (spec/list.md, BEH-LIST). The cases of tests/list.json hold what a selector
 * matches; these hold the API around it: normalization, the throw on a rejected selector, the slice helpers that moved
 * here from the CLI, and a graph and its export giving one answer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeSlices,
  claimingSlices,
  countBy,
  describingRecords,
  exportGraph,
  exportListMeta,
  LIST_CONTRACT,
  listOutput,
  readExport,
  readSelector,
  select,
} from "../src/index.ts";
import { FIXTURE_META, expandCase, runCase } from "./cases.ts";

const lantern = (patch: Record<string, { frontmatter: Record<string, unknown> }> = {}) =>
  runCase(expandCase({ section: "list", name: "lantern", baseline: "scheduling", valid: true, patch }));

test("BEH-LIST: readSelector sorts and deduplicates every list and writes the quantifier out", () => {
  const read = readSelector({
    types: ["scenario", "rule", "rule"],
    links: [{ kind: "governedBy", direction: "out", match: { statuses: ["draft", "approved"] } }],
  });
  assert.ok(read.ok);
  assert.deepEqual(read.selector, {
    types: ["rule", "scenario"],
    links: [{ direction: "out", kind: "governedBy", quantifier: "some", match: { statuses: ["approved", "draft"] } }],
  });
});

test("BEH-LIST: readSelector collects every problem, each with its pointer", () => {
  const read = readSelector({ colour: ["red"], types: [], ids: ["A-*-B"], availability: { release: ["x"] } });
  assert.equal(read.ok, false);
  assert.deepEqual(!read.ok && read.problems.map((p) => p.pointer), [
    "/colour",
    "/ids/0",
    "/types",
    "/availability/release",
  ]);
});

test("BEH-LIST: select throws on a selector readSelector rejects, rather than ignoring a key", () => {
  const { result } = lantern();
  assert.throws(() => select(result.graph, { colour: ["red"] } as never), /colour is not a selector field/);
});

test("BEH-LIST: a graph and its export give the same answer, withheld records included", () => {
  const { result, registries } = lantern({
    "RULE-ASMT-AUTH.md": { frontmatter: { "intentset.visibility": "restricted" } },
  });
  const read = readExport(JSON.parse(JSON.stringify(exportGraph(result, registries, FIXTURE_META))));
  assert.ok(read.ok);
  for (const selector of [
    {},
    { describing: ["SLICE-ASMT-SCHEDULE"] },
    {
      types: ["behavior" as const],
      links: [
        {
          direction: "out" as const,
          kind: "governedBy" as const,
          quantifier: "all" as const,
          match: { statuses: ["draft" as const] },
        },
      ],
    },
    { under: ["OUT-PREPARE"] },
  ]) {
    const a = select(result.graph, selector);
    const b = select(read.envelope, selector);
    assert.deepEqual(b.counts, a.counts);
    assert.deepEqual(
      b.rows.map((row) => row.id),
      a.rows.map((row) => row.id),
    );
    assert.deepEqual(b.undetermined, a.undetermined);
    assert.equal(a.counts.withheld, 1);
  }
  const meta = exportListMeta(read.envelope);
  const output = listOutput(select(read.envelope, {}), { source: "export", ...meta }, "status");
  assert.equal(output.contract, LIST_CONTRACT);
  assert.equal(output.snapshot.graphHash, read.envelope.graphHash);
  assert.equal(output.rows[0].reviewedBy, "not-supplied");
  assert.deepEqual(output.countBy?.groups, [
    { value: "approved", count: 1 },
    { value: "draft", count: 13 },
  ]);
});

test("BEH-LIST: includeRestricted selects over restricted records too, and nothing is withheld", () => {
  const { result } = lantern({ "RULE-ASMT-AUTH.md": { frontmatter: { "intentset.visibility": "restricted" } } });
  const all = select(result.graph, { types: ["rule"] }, { includeRestricted: true });
  assert.deepEqual(all.counts, { considered: 15, withheld: 0, matched: 2, undetermined: 0 });
});

test("BEH-LIST: countBy never writes a percentage, and puts the records with no value last", () => {
  const { result } = lantern();
  const counted = countBy(select(result.graph, { types: ["behavior", "rule"] }), "product");
  assert.deepEqual(counted, {
    field: "product",
    multiValued: true,
    groups: [
      { value: "PRD-LANTERN", count: 1 },
      { value: null, count: 2 },
    ],
  });
});

test("the slice helpers moved from the CLI give what they gave there", () => {
  const { result } = lantern();
  const graph = result.graph;
  assert.deepEqual(
    activeSlices(graph).map((slice) => slice.meta.id),
    ["SLICE-ASMT-SCHEDULE"],
  );
  assert.deepEqual(
    claimingSlices(graph, "src/features/assessment/schedule/form.ts").map((slice) => slice.meta.id),
    ["SLICE-ASMT-SCHEDULE"],
  );
  const slice = graph.artifacts.get("SLICE-ASMT-SCHEDULE");
  assert.ok(slice !== undefined);
  assert.deepEqual(
    describingRecords(graph, slice),
    select(graph, { describing: ["SLICE-ASMT-SCHEDULE"] }).rows.map((r) => r.id),
  );
});
