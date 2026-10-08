import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { contextFor, type Graph, graphHash, plainCarrier, readRegistries, validate } from "@intentset/core";
import { type PublishResult, publish, toChunks } from "@intentset/publisher";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createIntentsetServer, NOT_AVAILABLE, NOT_IN_SNAPSHOT, VERSION } from "../src/index.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const dir = join(root, "examples", "scheduling");
const registries = readRegistries(
  readFileSync(join(dir, "registries.yaml"), "utf8"),
  "examples/scheduling/registries.yaml",
).registries;
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => ({ name, source: readFileSync(join(dir, name), "utf8") }));

const COMMIT = "abcdef0123456789abcdef0123456789abcdef01";

function graphOf(edit: (name: string, source: string) => string = (_, s) => s): Graph {
  const result = validate(
    files.map(({ name, source }) => plainCarrier(`examples/scheduling/${name}`, edit(name, source))),
    registries,
  );
  assert.equal(result.ok, true, result.diagnostics.map((d) => d.message).join("\n"));
  return result.graph;
}

const graph = graphOf();
const snapshot = { commit: COMMIT, graphHash: graphHash(graph) };

/** The example with its knowledge approved and reviewed against the sources as they are, so it can be published. */
function reviewedGraph(): Graph {
  const pins = ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"]
    .map((id) => `        ${id}: ${graph.artifacts.get(id)?.sourceHash}`)
    .join("\n");
  return graphOf((name, source) =>
    name !== "KB-ASMT-SCHEDULE.md"
      ? source
      : source
          .replace("  status: draft", "  status: approved")
          .replace(
            "  revision: 1",
            `  revision: 1\n  reviewedBy: reviewer-ana\n  reviewedAt: '2026-09-30'\n  extensions:\n    intentset.org/review:\n      sources:\n${pins}`,
          ),
  );
}

const REQUEST = {
  audience: "teacher",
  product: "PRD-LANTERN",
  release: "pilot-1",
  role: "teacher",
  edition: "standard",
  flags: [] as string[],
};

function customerPublication(): { graph: Graph; publication: PublishResult } {
  const reviewed = reviewedGraph();
  const publication = publish(
    reviewed,
    registries,
    { visibility: "customer", ...REQUEST },
    { snapshot: { commit: COMMIT, graphHash: graphHash(reviewed) }, publishedAt: "2026-10-01T00:00:00Z" },
  );
  assert.equal(publication.ok, true, publication.diagnostics.map((d) => d.message).join("\n"));
  assert.deepEqual(publication.index.published, ["KB-ASMT-SCHEDULE"]);
  return { graph: reviewed, publication };
}

async function connect(server: Server): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "intentset-test", version: "0.0.0" });
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
  return client;
}

async function engineering(options: { graph?: Graph; includeRestricted?: boolean } = {}): Promise<Client> {
  const g = options.graph ?? graph;
  return connect(
    createIntentsetServer({
      mode: "engineering",
      graph: g,
      snapshot: { commit: COMMIT, graphHash: graphHash(g) },
      includeRestricted: options.includeRestricted,
    }),
  );
}

interface Called {
  text: string;
  json: Record<string, unknown>;
  isError: boolean;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Called> {
  const response = await client.callTool({ name, arguments: args });
  const content = response.content as { type: string; text: string }[];
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "text");
  return { text: content[0].text, json: JSON.parse(content[0].text), isError: response.isError === true };
}

async function toolNames(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((t) => t.name);
}

test("engineering mode lists the four read-only engineering tools, with JSON Schema inputs", async () => {
  const client = await engineering();
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name),
    ["intentset_context", "intentset_impact", "intentset_lookup", "intentset_search"],
  );
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal((tool.inputSchema as { additionalProperties?: boolean }).additionalProperties, false);
    assert.equal(tool.annotations?.readOnlyHint, true);
  }
  await client.close();
});

test("customer mode lists only the two knowledge tools", async () => {
  const { publication } = customerPublication();
  const client = await connect(createIntentsetServer({ mode: "customer", publication }));
  assert.deepEqual(await toolNames(client), ["knowledge_get", "knowledge_search"]);
  await client.close();
});

test("lookup gives metadata, path and body, after the snapshot and the source path", async () => {
  const client = await engineering();
  const { json, isError } = await call(client, "intentset_lookup", { id: "BEH-ASMT-SCHEDULE" });
  assert.equal(isError, false);
  assert.deepEqual(Object.keys(json).slice(0, 2), ["snapshot", "sources"]);
  assert.deepEqual(json.snapshot, snapshot);
  assert.deepEqual(json.sources, ["examples/scheduling/BEH-ASMT-SCHEDULE.md"]);
  const artifact = json.artifact as Record<string, unknown>;
  assert.equal(artifact.title, "Schedule a student assessment");
  assert.equal(artifact.parent, "CAP-ASMT-ASSIGN");
  assert.deepEqual(artifact.links, { governedBy: ["RULE-ASMT-FUTURE", "RULE-ASMT-AUTH"] });
  assert.deepEqual(artifact.linkedFrom, {
    explains: ["KB-ASMT-SCHEDULE"],
    illustrates: ["SCN-ASMT-SCHEDULE"],
    implements: ["SLICE-ASMT-SCHEDULE"],
    verifies: ["TEST-ASMT-SCHEDULE"],
  });
  assert.match(artifact.body as string, /^# Schedule a student assessment$/m);
  assert.equal(json.withheld, 0);
  await client.close();
});

test("context is core's contextFor bundle, each artifact with its path and body", async () => {
  const client = await engineering();
  const { json } = await call(client, "intentset_context", { id: "BEH-ASMT-SCHEDULE" });
  const bundle = contextFor(graph, "BEH-ASMT-SCHEDULE");
  const artifacts = json.artifacts as Record<string, unknown>[];
  assert.deepEqual(
    artifacts.map(({ id, role, path }) => ({ id, role, path })),
    bundle?.artifacts.map(({ id, role, path }) => ({ id, role, path })),
  );
  for (const a of artifacts) {
    assert.equal(a.body, graph.artifacts.get(a.id as string)?.body);
    assert.equal(a.sourceHash, graph.artifacts.get(a.id as string)?.sourceHash);
  }
  assert.deepEqual(
    json.sources,
    artifacts.map((a) => a.path),
  );
  assert.equal(json.start, "BEH-ASMT-SCHEDULE");
  assert.equal(json.withheld, 0);
  await client.close();
});

test("impact is core's report: direct apart from candidates, with paths and reasons", async () => {
  const client = await engineering();
  const { json } = await call(client, "intentset_impact", { id: "RULE-ASMT-FUTURE" });
  const ids = (key: string) => (json[key] as { id: string }[]).map((h) => h.id);
  assert.deepEqual(ids("direct"), ["BEH-ASMT-SCHEDULE", "KB-ASMT-SCHEDULE", "TEST-ASMT-SCHEDULE"]);
  assert.deepEqual(ids("candidates"), ["SCN-ASMT-SCHEDULE", "SLICE-ASMT-SCHEDULE"]);
  const slice = (json.candidates as { id: string; file: string; path: { reason: string }[] }[])[1];
  assert.equal(slice.file, "examples/scheduling/SLICE-ASMT-SCHEDULE.md");
  assert.deepEqual(
    slice.path.map((s) => s.reason),
    ["BEH-ASMT-SCHEDULE is governed by RULE-ASMT-FUTURE.", "SLICE-ASMT-SCHEDULE implements BEH-ASMT-SCHEDULE."],
  );
  assert.ok((json.sources as string[]).includes("examples/scheduling/RULE-ASMT-FUTURE.md"));
  assert.match(json.note as string, /not proof/);
  await client.close();
});

test("search is a case-insensitive substring over ID, title and body, sorted by ID, typed when asked", async () => {
  const client = await engineering();
  const all = (await call(client, "intentset_search", { query: "SCHEDULE" })).json;
  const ids = (all.results as { id: string }[]).map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.ok(ids.includes("BEH-ASMT-SCHEDULE") && ids.includes("CONTRACT-ASMT-SCHEDULE"));
  assert.equal(all.matched, ids.length);
  assert.deepEqual(
    all.sources,
    (all.results as { path: string }[]).map((r) => r.path),
  );

  const rules = (await call(client, "intentset_search", { query: "require", types: ["rule"] })).json;
  assert.deepEqual(
    (rules.results as { id: string }[]).map((r) => r.id),
    ["RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"],
  );
  const body = (await call(client, "intentset_search", { query: "students gain access" })).json;
  assert.deepEqual(
    (body.results as { id: string }[]).map((r) => r.id),
    ["BEH-ASMT-SCHEDULE"],
  );
  const none = (await call(client, "intentset_search", { query: "no such words anywhere" })).json;
  assert.deepEqual([none.matched, none.shown, none.results], [0, 0, []]);
  await assert.rejects(client.callTool({ name: "intentset_search", arguments: { query: "x", types: ["widget"] } }));
  await client.close();
});

test("every engineering result, errors included, begins with the snapshot and lists source paths", async () => {
  const client = await engineering();
  const calls: [string, Record<string, unknown>][] = [];
  for (const id of [...graph.artifacts.keys(), "BEH-NOPE"]) {
    for (const tool of ["intentset_lookup", "intentset_context", "intentset_impact"]) calls.push([tool, { id }]);
  }
  calls.push(["intentset_search", { query: "assessment" }]);
  for (const [tool, args] of calls) {
    const { json, isError } = await call(client, tool, args);
    assert.deepEqual(Object.keys(json).slice(0, 2), ["snapshot", "sources"], `${tool} ${JSON.stringify(args)}`);
    assert.deepEqual(json.snapshot, snapshot);
    assert.ok(Array.isArray(json.sources));
    if (args.id === "BEH-NOPE") {
      assert.equal(isError, true);
      assert.equal(json.error, NOT_IN_SNAPSHOT);
    } else {
      assert.equal(isError, false, `${tool} ${JSON.stringify(args)}`);
      assert.ok((json.sources as string[]).length > 0);
    }
  }
  await client.close();
});

test("restricted artifacts read as absent, are withheld from links and context, and are never searched", async () => {
  const restricted = graphOf((name, source) =>
    name === "RULE-ASMT-AUTH.md" ? source.replace("visibility: internal", "visibility: restricted") : source,
  );
  const client = await engineering({ graph: restricted });
  const absent = await call(client, "intentset_lookup", { id: "BEH-NOPE" });
  const hidden = await call(client, "intentset_lookup", { id: "RULE-ASMT-AUTH" });
  assert.equal(hidden.text, absent.text);
  const behavior = (await call(client, "intentset_lookup", { id: "BEH-ASMT-SCHEDULE" })).json;
  assert.deepEqual((behavior.artifact as { links: unknown }).links, { governedBy: ["RULE-ASMT-FUTURE"] });
  assert.equal(behavior.withheld, 1);
  const context = (await call(client, "intentset_context", { id: "BEH-ASMT-SCHEDULE" })).json;
  assert.equal(context.withheld, 1);
  assert.ok(!(context.artifacts as { id: string }[]).some((a) => a.id === "RULE-ASMT-AUTH"));
  const search = (await call(client, "intentset_search", { query: "assignment permission" })).json;
  assert.equal(search.matched, 0);
  const impact = (await call(client, "intentset_impact", { id: "BEH-ASMT-SCHEDULE" })).json;
  assert.ok(!JSON.stringify(impact).includes("RULE-ASMT-AUTH"));
  await client.close();

  const trusted = await engineering({ graph: restricted, includeRestricted: true });
  assert.equal((await call(trusted, "intentset_lookup", { id: "RULE-ASMT-AUTH" })).isError, false);
  await trusted.close();
});

test("customer search and get return published knowledge, citing named sources and the snapshot", async () => {
  const { publication } = customerPublication();
  const client = await connect(createIntentsetServer({ mode: "customer", publication }));
  const search = (await call(client, "knowledge_search", { query: "Release TIME" })).json;
  assert.deepEqual(search.snapshot, publication.index.snapshot);
  assert.equal(search.projection, "customer");
  const results = search.results as { passage: string; document: string; citation: Record<string, unknown> }[];
  assert.deepEqual(
    results.map((r) => r.passage),
    ["KB-ASMT-SCHEDULE/1"],
  );
  const citation = results[0].citation;
  assert.equal((citation.source as { id: string }).id, "KB-ASMT-SCHEDULE");
  // The three sources it explains are internal: counted, never named.
  assert.deepEqual(citation.sources, []);
  assert.equal(citation.withheldSources, 3);
  assert.deepEqual(citation.snapshot, publication.index.snapshot);

  const nothing = (await call(client, "knowledge_search", { query: "quarterly invoices" })).json;
  assert.equal(nothing.matched, 0);
  assert.match(nothing.note as string, /nothing to answer from/);

  const got = await call(client, "knowledge_get", { id: "KB-ASMT-SCHEDULE" });
  assert.equal(got.isError, false);
  assert.equal(got.json.markset, publication.documents[0].markset);
  assert.match(got.json.markset as string, /^---\nmarkset: 0\nintentset-publication:\n/);
  await client.close();
});

test("customer mode cannot reach an internal record by any tool or argument", async () => {
  const { graph: reviewed, publication } = customerPublication();
  // Even an options object that smuggles the graph in gives the server nothing more.
  const smuggled = { mode: "customer", publication, graph: reviewed } as unknown as Parameters<
    typeof createIntentsetServer
  >[0];
  const client = await connect(createIntentsetServer(smuggled));
  assert.deepEqual(await toolNames(client), ["knowledge_get", "knowledge_search"]);

  const internal = [...reviewed.artifacts.values()].filter((a) => !["public", "customer"].includes(a.meta.visibility));
  assert.ok(internal.length >= 12);
  const outputs: string[] = [];
  const unknown = await call(client, "knowledge_get", { id: "BEH-DOES-NOT-EXIST" });
  assert.equal(unknown.isError, true);
  assert.equal(unknown.json.error, NOT_AVAILABLE);
  for (const artifact of internal) {
    const got = await call(client, "knowledge_get", { id: artifact.meta.id });
    // The same bytes as for an ID that exists nowhere: nothing tells the two apart.
    assert.equal(got.text, unknown.text, artifact.meta.id);
    for (const query of [artifact.meta.id, artifact.meta.title, artifact.path, artifact.body.slice(-60)]) {
      // Everything but the echoed query, which is the caller's own text.
      const { query: _echo, ...answer } = (await call(client, "knowledge_search", { query })).json;
      outputs.push(JSON.stringify(answer));
    }
  }
  for (const name of ["intentset_lookup", "intentset_context", "intentset_impact", "intentset_search"]) {
    await assert.rejects(client.callTool({ name, arguments: { id: "BEH-ASMT-SCHEDULE", query: "x" } }), /Unknown tool/);
  }
  await assert.rejects(
    client.callTool({ name: "knowledge_get", arguments: { id: "BEH-ASMT-SCHEDULE", mode: "engineering" } }),
    /unknown argument/,
  );
  await assert.rejects(
    client.callTool({ name: "knowledge_search", arguments: { query: "x", includeRestricted: true } }),
    /unknown argument/,
  );
  const everything = [...outputs, unknown.text].join("\n");
  for (const artifact of internal) {
    assert.ok(!everything.includes(artifact.path), artifact.path);
    assert.ok(!everything.includes(artifact.meta.title), artifact.meta.title);
  }
  await client.close();
});

test("customer mode refuses a publication that is not a public or customer projection", () => {
  const reviewed = reviewedGraph();
  const internal = publish(
    reviewed,
    registries,
    { visibility: "internal", authorizedInternal: true, ...REQUEST },
    { snapshot: { commit: COMMIT, graphHash: graphHash(reviewed) }, publishedAt: "2026-10-01T00:00:00Z" },
  );
  assert.throws(() => createIntentsetServer({ mode: "customer", publication: internal }), /public or customer/);
  const { publication } = customerPublication();
  const foreign = toChunks([{ ...publication.documents[0], id: "KB-OTHER" }]);
  assert.throws(
    () => createIntentsetServer({ mode: "customer", publication, chunks: foreign }),
    /not belong to a document in the publication index/,
  );
});

test("an unknown tool is an error in both modes", async () => {
  const eng = await engineering();
  await assert.rejects(eng.callTool({ name: "intentset_write", arguments: {} }), /Unknown tool: intentset_write/);
  await eng.close();
  const { publication } = customerPublication();
  const customer = await connect(createIntentsetServer({ mode: "customer", publication }));
  await assert.rejects(customer.callTool({ name: "knowledge_delete", arguments: {} }), /Unknown tool/);
  await customer.close();
});

test("a snapshot that is not the graph's is refused, and the version is the package's", () => {
  assert.throws(
    () => createIntentsetServer({ mode: "engineering", graph, snapshot: { commit: null, graphHash: "0".repeat(64) } }),
    /graph hash/,
  );
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"));
  assert.equal(VERSION, manifest.version);
});
