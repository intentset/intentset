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
  type CheckedRequest,
  type ExclusionReason,
  type PublicationRequest,
  type ReviewStatus,
  availabilityReason,
  checkRequest,
  exclusionReason,
  project,
} from "../src/index.ts";
import { customer, example, registriesWith, reviewed, snapshotOf } from "./harness.ts";

const CURRENT: ReviewStatus = {
  status: "current",
  changed: [],
  missing: [],
  unknownHash: null,
  reviewer: "r",
  reviewedAt: "2026-09-30",
  self: "unpinned",
  gates: "unpinned",
  keepable: false,
  keepBlockers: ["current"],
};

function knowledge(availability: Availability | undefined, extra: Partial<Artifact["meta"]> = {}): Artifact {
  return {
    meta: {
      spec: "0.3",
      profile: "intentset/knowledge/0.3",
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
    contentHash: "0".repeat(64),
    ownContentHash: "0".repeat(64),
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
const REQUEST: CheckedRequest = {
  visibility: "customer",
  audience: ["teacher"],
  product: "PRD-B",
  release: "r2",
  role: ["admin"],
  edition: "district",
  flags: [],
  keepUnderReview: false,
  authorizedInternal: false,
  authorizedRestricted: false,
};
/** A checked request from the baseline with these changes; a string audience or role is a list of one. */
function checked(request: Partial<PublicationRequest> = {}): CheckedRequest {
  const { audience, role, ...rest } = request;
  const list = (value: string | readonly string[]) => (typeof value === "string" ? [value] : [...value]);
  return {
    ...REQUEST,
    ...rest,
    ...(audience === undefined ? {} : { audience: list(audience) }),
    ...(role === undefined ? {} : { role: list(role) }),
  } as CheckedRequest;
}
const reason = (artifact: Artifact, request: Partial<PublicationRequest> = {}): ExclusionReason | null =>
  exclusionReason(artifact, checked(request), () => CURRENT);

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

test("BEH-PUBLISH: deny by default: type, lifecycle, visibility, audience and missing availability each exclude", () => {
  assert.equal(reason(knowledge(AVAILABLE, { type: "behavior" })), "not-knowledge");
  assert.equal(reason(knowledge(AVAILABLE, { status: "draft" })), "draft");
  assert.equal(reason(knowledge(AVAILABLE, { status: "retired" })), "retired");
  for (const status of ["approved", "deprecated"] as const) {
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

test("BEH-PUBLISH-READER: checkRequest reads an audience or role list as a set, so order and repeats change nothing", () => {
  const { graph, registries } = example({
    kb: reviewed(),
    registries: registriesWith({ roles: ["administrator", "student", "teacher"] }),
  });
  const read = (extra: Record<string, unknown>) => checkRequest(customer(extra), graph, registries);
  const one = read({});
  assert.deepEqual(one.diagnostics, []);
  assert.deepEqual(one.request?.role, ["teacher"]);
  assert.deepEqual(one.request?.audience, ["teacher"]);
  assert.deepEqual(read({ role: ["teacher"] }).request, one.request);
  assert.deepEqual(read({ role: ["teacher", "teacher"] }).request, one.request);
  const two = read({ role: ["teacher", "administrator", "teacher"] });
  assert.deepEqual(two.request?.role, ["administrator", "teacher"]);
  assert.deepEqual(read({ role: ["administrator", "teacher"] }).request, two.request);
  assert.equal(two.request?.authorizedInternal, false);
  assert.equal(two.request?.authorizedRestricted, false);
});

test("BEH-PUBLISH-READER: a list member that is not a name, an empty list, and a list for a single dimension are refused", () => {
  const { graph, registries } = example({ kb: reviewed() });
  const messages = (extra: Record<string, unknown>) =>
    checkRequest(customer(extra), graph, registries).diagnostics.map((d) => `${d.code} ${d.message}`);
  assert.deepEqual(messages({ role: ["teacher", ""] }), [
    "PUB001 The request's role is not a role name or a list of role names.",
  ]);
  assert.deepEqual(messages({ role: ["teacher", 7] }), [
    "PUB001 The request's role is not a role name or a list of role names.",
  ]);
  assert.deepEqual(messages({ audience: [null] }), [
    "PUB001 The request's audience is not an audience name or a list of audience names.",
  ]);
  assert.deepEqual(messages({ role: [] }), ["PUB001 The request names no role."]);
  assert.deepEqual(messages({ audience: [] }), ["PUB001 The request names no audience."]);
  assert.deepEqual(messages({ release: ["pilot-1"] }), [
    "PUB001 The request's release is a list; a request is for one reader, on one release.",
  ]);
  assert.deepEqual(messages({ product: ["PRD-LANTERN"], edition: ["standard"] }), [
    "PUB001 The request's product is a list; a request is for one reader, on one product.",
    "PUB001 The request's edition is a list; a request is for one reader, on one edition.",
  ]);
});

test("BEH-PUBLISH-READER: each unknown member of a list is refused on its own, and a known one never rescues it", () => {
  const { graph, registries } = example({ kb: reviewed() });
  const result = checkRequest(customer({ role: ["teacher", "principal", "dean"] }), graph, registries);
  assert.equal(result.request, null);
  assert.deepEqual(
    result.diagnostics.map((d) => d.message),
    [
      "The request names role dean, which the registries do not declare.",
      "The request names role principal, which the registries do not declare.",
    ],
  );
});

test("BEH-PUBLISH-READER: a role list admits knowledge available to any one of its roles", () => {
  const available = knowledge({ ...AVAILABLE, roles: ["teacher"] });
  assert.equal(reason(available, { role: ["admin"] }), "role");
  assert.equal(reason(available, { role: ["admin", "teacher"] }), null);
  assert.equal(reason(knowledge(AVAILABLE, { audiences: ["product"] }), { audience: ["teacher", "product"] }), null);
  assert.equal(
    reason(knowledge(AVAILABLE, { audiences: ["product"] }), { audience: ["teacher", "parent"] }),
    "audience",
  );
});

test("BEH-PUBLISH-READER: availabilityReason fails closed on a missing block and names the first failing dimension", () => {
  assert.equal(availabilityReason(undefined, REQUEST), "availability-missing");
  assert.equal(availabilityReason(AVAILABLE, REQUEST), null);
  assert.equal(availabilityReason(AVAILABLE, checked({ release: "r3", role: ["student"] })), "release");
  assert.equal(availabilityReason(AVAILABLE, checked({ role: ["student", "parent"] })), "role");
  assert.equal(availabilityReason({ ...AVAILABLE, flags: ["beta"] }, REQUEST), "flag");
});

test("BEH-PUBLISH-READER: CORE008 for an audience or role names only the request's values", () => {
  const { graph, registries } = example({
    kb: reviewed(),
    registries: registriesWith({ roles: ["administrator", "student", "teacher"] }),
  });
  const refusal = (extra: Record<string, unknown>) => {
    const result = project(graph, registries, customer({ ids: ["KB-ASMT-SCHEDULE"], ...extra }), {
      snapshot: snapshotOf(graph),
    });
    assert.equal(result.diagnostics.length, 1);
    return result.diagnostics[0];
  };
  const one = refusal({ role: "student" });
  assert.equal(one.field, "/intentset/availability/roles");
  assert.match(one.message, /\(role\): it is not available for role student\.$/);
  const roles = refusal({ role: ["student", "administrator"] });
  assert.equal(roles.field, "/intentset/availability/roles");
  assert.match(roles.message, /it is available for none of the roles administrator, student\.$/);
  assert.ok(!roles.message.includes("teacher"));
  const audience = refusal({ audience: "product" });
  assert.match(audience.message, /it is not written for the product audience\.$/);
  const audiences = refusal({ audience: ["product", "engineering"] });
  assert.equal(audiences.field, "/intentset/audiences");
  assert.match(audiences.message, /it is written for none of the audiences engineering, product\.$/);
});
