/**
 * `delivery` in core (Core §7, ADR 0017, BEH-DELIVERY): read from a record, made effective with the status, checked
 * against the status and the implementing slice, and carried through the export. The cases of tests/core.json,
 * tests/vsa.json, tests/publication.json, tests/list.json and tests/export.json hold the rest.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DELIVERY_TYPES, deliveryOf, readExport } from "../src/index.ts";
import { expandCase, runCase } from "./cases.ts";

type Patch = Record<string, { frontmatter: Record<string, unknown> }>;
const lantern = (patch: Patch = {}, level?: "L1" | "L2") =>
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
const SLICE = "SLICE-ASMT-SCHEDULE.md";

test("BEH-DELIVERY: the effective delivery is the field, then a status that claims an implementation, then not stated", () => {
  assert.equal(deliveryOf({ status: "draft", delivery: "built" }), "built");
  assert.equal(deliveryOf({ status: "approved", delivery: "planned" }), "planned");
  assert.equal(deliveryOf({ status: "draft" }), null);
  assert.equal(deliveryOf({ status: "approved" }), null, "approval claims nothing about the code");
  for (const status of ["implemented", "released", "deprecated"] as const) {
    assert.equal(deliveryOf({ status }), "built", status);
  }
  assert.equal(deliveryOf({ status: "retired" }), null);
  assert.equal(deliveryOf({ status: "draft", delivery: null }), null, "an export's null is not stated");
});

test("BEH-DELIVERY: a record reads delivery on the types that carry it, and CORE001 elsewhere or for another value", () => {
  const read = lantern({ [BEH]: set({ delivery: "built" }) });
  assert.equal(read.result.graph.artifacts.get("BEH-ASMT-SCHEDULE")?.meta.delivery, "built");
  assert.deepEqual(DELIVERY_TYPES, ["capability", "behavior", "rule", "scenario", "slice", "contract"]);

  const onMeasure = lantern({ "MEAS-PREPARE-ADOPTION.md": set({ delivery: "built" }) });
  const measure = onMeasure.diagnostics.find((d) => d.code === "CORE001");
  assert.equal(measure?.field, "/intentset/delivery");
  assert.match(measure?.message ?? "", /written on a measure/);

  const value = lantern({ [BEH]: set({ delivery: "done" }) }).diagnostics.find((d) => d.code === "CORE001");
  assert.match(value?.message ?? "", /must be planned or built/);
});

test("BEH-DELIVERY: planned with a status that claims an implementation, and a built behavior with a planned slice, are CORE005", () => {
  const planned = lantern({ [BEH]: set({ status: "implemented", delivery: "planned" }) });
  const status = planned.diagnostics.filter((d) => d.code === "CORE005");
  assert.equal(status.length, 1);
  assert.equal(status[0].severity, "error");
  assert.match(status[0].message, /planned while its status, implemented, claims an implementation/);

  const slice = lantern({ [BEH]: set({ delivery: "built" }), [SLICE]: set({ delivery: "planned" }) });
  const contradiction = slice.diagnostics.filter((d) => d.code === "CORE005");
  assert.equal(contradiction.length, 1);
  assert.equal(contradiction[0].artifact, "BEH-ASMT-SCHEDULE");
  assert.match(contradiction[0].message, /SLICE-ASMT-SCHEDULE, which implements it, says its work is planned/);

  const consistent = lantern({
    [BEH]: set({ status: "approved", delivery: "planned" }),
    [SLICE]: set({ delivery: "built" }),
  });
  assert.deepEqual(
    consistent.diagnostics.map((d) => d.code),
    [],
    "approval and delivery can come in either order",
  );
});

test("BEH-DELIVERY: at L2 a draft behavior that says built and that no product slice implements is a CORE006 warning", () => {
  const orphan = { [SLICE]: set({ "links.implements": null }) };
  const built = lantern({ ...orphan, [BEH]: set({ delivery: "built" }) }, "L2");
  const warning = built.diagnostics.find((d) => d.code === "CORE006");
  assert.equal(warning?.severity, "warning");
  assert.match(warning?.message ?? "", /says its work is built, and no product slice implements it/);

  const planned = lantern({ ...orphan, [BEH]: set({ delivery: "planned" }) }, "L2");
  assert.equal(
    planned.diagnostics.find((d) => d.code === "CORE006"),
    undefined,
  );
  const atL1 = lantern({ ...orphan, [BEH]: set({ delivery: "built" }) });
  assert.equal(
    atL1.diagnostics.find((d) => d.code === "CORE006"),
    undefined,
    "ownership is checked from L2",
  );
});

test("BEH-DELIVERY: the export carries delivery as written, and readExport refuses it on a type that does not carry it", () => {
  const { envelope } = lantern({
    [BEH]: set({ delivery: "built" }),
    "RULE-ASMT-AUTH.md": set({ status: "implemented" }),
  });
  const plain = JSON.parse(JSON.stringify(envelope));
  const byId = new Map(plain.artifacts.map((a: { id: string }) => [a.id, a]));
  assert.equal((byId.get("BEH-ASMT-SCHEDULE") as { delivery: unknown }).delivery, "built");
  assert.equal(
    (byId.get("RULE-ASMT-AUTH") as { delivery: unknown }).delivery,
    null,
    "the field as written; implemented makes it built only when read",
  );
  assert.ok(readExport(plain).ok);

  const measure = plain.artifacts.find((a: { type: string }) => a.type === "measure");
  measure.delivery = "built";
  const refused = readExport(plain);
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.problems.some((p) => p.pointer.endsWith("/delivery")));
});
