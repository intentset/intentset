/**
 * The projection (Core §7, §9): availability is AND across dimensions and OR
 * within one, every named flag is required, visibility and audience restrict,
 * drafts and retired records stay out, and a refusal of a requested ID says
 * nothing about an artifact the caller may not see.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Artifact, Availability, Graph } from "@intentset/core";
import {
  type ExclusionReason,
  type PublicationRequest,
  type ReviewStatus,
  exclusionReason,
  project,
} from "../src/index.ts";
import { customer, example, reviewed, snapshotOf } from "./harness.ts";

const CURRENT: ReviewStatus = { status: "current", changed: [], missing: [], reviewer: "r", reviewedAt: "2026-09-30" };

function knowledge(availability: Availability | undefined, extra: Partial<Artifact["meta"]> = {}): Artifact {
  return {
    meta: {
      spec: "0.1",
      profile: "intentset/knowledge/0.1",
      id: "KB-X",
      type: "knowledge",
      title: "Knowledge",
      status: "approved",
      owner: "team",
      visibility: "customer",
      audiences: ["teacher"],
      links: { explains: ["BEH-X"] },
      ...(availability === undefined ? {} : { availability }),
      ...extra,
    },
    path: "KB-X.md",
    sourceHash: "0".repeat(64),
    body: "\n# Knowledge\n",
    headings: [],
    foreign: {},
  };
}

const AVAILABLE: Availability = {
  products: ["PRD-A", "PRD-B"],
  releases: ["r1", "r2"],
  roles: ["teacher", "admin"],
  editions: ["standard", "district"],
  flags: [],
};
const REQUEST: PublicationRequest = {
  visibility: "customer",
  audience: "teacher",
  product: "PRD-B",
  release: "r2",
  role: "admin",
  edition: "district",
  flags: [],
};
const reason = (artifact: Artifact, request: Partial<PublicationRequest> = {}): ExclusionReason | null =>
  exclusionReason(artifact, { ...REQUEST, ...request }, () => CURRENT);

test("availability is OR within a dimension: any listed value matches", () => {
  assert.equal(reason(knowledge(AVAILABLE)), null);
  assert.equal(
    reason(knowledge(AVAILABLE), { product: "PRD-A", release: "r1", role: "teacher", edition: "standard" }),
    null,
  );
});

test("availability is AND across dimensions: one miss excludes, reported by the dimension that missed", () => {
  assert.equal(reason(knowledge(AVAILABLE), { product: "PRD-C" }), "product");
  assert.equal(reason(knowledge(AVAILABLE), { release: "r3" }), "release");
  assert.equal(reason(knowledge(AVAILABLE), { role: "student" }), "role");
  assert.equal(reason(knowledge(AVAILABLE), { edition: "premium" }), "edition");
  assert.equal(reason(knowledge(AVAILABLE), { release: "r3", role: "student" }), "release");
});

test("every named flag is required, extra requested flags are harmless, and empty flags need none", () => {
  const flagged = knowledge({ ...AVAILABLE, flags: ["beta", "pilot"] });
  assert.equal(reason(flagged), "flag");
  assert.equal(reason(flagged, { flags: ["beta"] }), "flag");
  assert.equal(reason(flagged, { flags: ["beta", "pilot"] }), null);
  assert.equal(reason(flagged, { flags: ["beta", "other", "pilot"] }), null);
  assert.equal(reason(knowledge(AVAILABLE), { flags: ["beta"] }), null);
});

test("release labels match exactly: no SemVer ordering, no case folding", () => {
  const exact = knowledge({ ...AVAILABLE, releases: ["1.2"] });
  assert.equal(reason(exact, { release: "1.2" }), null);
  assert.equal(reason(exact, { release: "1.2.0" }), "release");
  assert.equal(reason(knowledge(AVAILABLE), { release: "R2" }), "release");
});

test("deny by default: type, lifecycle, visibility, audience and missing availability each exclude", () => {
  assert.equal(reason(knowledge(AVAILABLE, { type: "behavior" })), "not-knowledge");
  assert.equal(reason(knowledge(AVAILABLE, { status: "draft" })), "draft");
  assert.equal(reason(knowledge(AVAILABLE, { status: "retired" })), "retired");
  for (const status of ["approved", "implemented", "released", "deprecated"] as const) {
    assert.equal(reason(knowledge(AVAILABLE, { status })), null, status);
  }
  assert.equal(reason(knowledge(AVAILABLE, { visibility: "internal" })), "visibility");
  assert.equal(reason(knowledge(AVAILABLE, { visibility: "customer" }), { visibility: "public" }), "visibility");
  assert.equal(reason(knowledge(AVAILABLE, { visibility: "public" }), { visibility: "public" }), null);
  assert.equal(reason(knowledge(AVAILABLE, { audiences: ["product"] })), "audience");
  assert.equal(reason(knowledge(undefined)), "availability-missing");
  assert.equal(
    exclusionReason(knowledge(AVAILABLE), REQUEST, () => ({ ...CURRENT, status: "needs-review" })),
    "needs-review",
  );
});

test("an internal projection with authorization admits internal knowledge; restricted needs both authorizations", () => {
  const { graph, registries } = example({
    kb: reviewed({ "intentset.visibility": "internal", "intentset.audiences": ["teacher"] }),
  });
  const options = { snapshot: snapshotOf(graph) };
  const refused = project(graph, registries, customer({ visibility: "internal" }), options);
  assert.equal(refused.request, null);
  assert.deepEqual(
    refused.diagnostics.map((d) => d.code),
    ["PUB001"],
  );
  const internal = project(graph, registries, customer({ visibility: "internal", authorizedInternal: true }), options);
  assert.deepEqual(internal.diagnostics, []);
  assert.deepEqual(
    internal.eligible.map((a) => a.meta.id),
    ["KB-ASMT-SCHEDULE"],
  );
  const half = project(graph, registries, customer({ visibility: "restricted", authorizedRestricted: true }), options);
  assert.deepEqual(
    half.diagnostics.map((d) => d.code),
    ["PUB001"],
  );
  const restricted = project(
    graph,
    registries,
    customer({ visibility: "restricted", authorizedInternal: true, authorizedRestricted: true }),
    options,
  );
  assert.deepEqual(
    restricted.eligible.map((a) => a.meta.id),
    ["KB-ASMT-SCHEDULE"],
  );
});

test("a request is refused when a dimension is missing, a key is unknown, or a value is undeclared", () => {
  const { graph, registries } = example({ kb: reviewed() });
  const options = { snapshot: snapshotOf(graph) };
  const codes = (request: unknown) =>
    project(graph, registries, request as PublicationRequest, options).diagnostics.map((d) => d.message);
  const { role: _role, ...noRole } = customer();
  assert.deepEqual(codes(noRole), ["The request names no role."]);
  assert.match(codes({ ...customer(), edtion: "standard" })[0], /unknown key `edtion`/);
  assert.match(codes(customer({ product: "BEH-ASMT-SCHEDULE" }))[0], /not a product in this snapshot/);
  assert.match(codes(customer({ audience: "parents" }))[0], /audience registry does not declare/);
  assert.match(codes(customer({ flags: ["beta"] }))[0], /flag beta, which the registries do not declare/);
  assert.match(codes(customer({ visibility: "everyone" }))[0], /not one of public, customer, internal or restricted/);
  assert.equal(codes(null).length, 1);
});

test("a snapshot whose graph hash is not the graph's refuses the request", () => {
  const { graph, registries } = example({ kb: reviewed() });
  const result = project(graph, registries, customer(), { snapshot: { commit: "abc", graphHash: "f".repeat(64) } });
  assert.equal(result.request, null);
  assert.deepEqual(
    result.diagnostics.map((d) => d.code),
    ["PUB001"],
  );
  assert.deepEqual(result.eligible, []);
});

test("an unknown ID and an ID outside the projection are refused with the same words and no path", () => {
  const { graph, registries } = example({ kb: reviewed() });
  const result = project(graph, registries, customer({ ids: ["ADR-ASMT-SEAM", "ADR-NOT-THERE"] }), {
    snapshot: snapshotOf(graph),
  });
  assert.equal(result.diagnostics.length, 2);
  const [known, unknown] = result.diagnostics;
  assert.equal(known.path, null);
  assert.equal(unknown.path, null);
  assert.equal(known.message.replace("ADR-ASMT-SEAM", "<ID>"), unknown.message.replace("ADR-NOT-THERE", "<ID>"));
  assert.ok(!JSON.stringify(result.diagnostics).includes("Keep backend access behind the slice seam"));
  assert.ok(!JSON.stringify(result.diagnostics).includes("ADR-ASMT-SEAM.md"));
});

test("a request naming ids considers only those; the rest are excluded as not requested", () => {
  const { graph, registries } = example({ kb: reviewed() });
  const result = project(graph, registries, customer({ ids: ["KB-ASMT-SCHEDULE"] }), { snapshot: snapshotOf(graph) });
  assert.deepEqual(
    result.eligible.map((a) => a.meta.id),
    ["KB-ASMT-SCHEDULE"],
  );
  assert.ok(result.excluded.every((e) => e.reason === "not-requested"));
  assert.equal(result.excluded.length, graph.artifacts.size - 1);
  const none = project(graph, registries, customer({ ids: [] }), { snapshot: snapshotOf(graph) });
  assert.deepEqual(none.eligible, []);
  assert.deepEqual(none.diagnostics, []);
});

test("precomputed review statuses are honoured", () => {
  const { graph, registries } = example({ kb: reviewed() });
  const stale = new Map([
    ["KB-ASMT-SCHEDULE", { ...CURRENT, status: "needs-review" as const, changed: ["RULE-ASMT-AUTH"] }],
  ]);
  const result = project(graph as Graph, registries, customer(), { snapshot: snapshotOf(graph), reviews: stale });
  assert.deepEqual(result.eligible, []);
  assert.deepEqual(
    result.excluded.find((e) => e.id === "KB-ASMT-SCHEDULE"),
    { id: "KB-ASMT-SCHEDULE", reason: "needs-review" },
  );
});
