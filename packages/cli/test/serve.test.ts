/**
 * serve and mcp, in-process. serve is run through `main` with an abort
 * signal, on an ephemeral port, and spoken to over HTTP. mcp's server is
 * built by the function the command uses and driven by the SDK's client over
 * an in-memory transport; one test also starts the real bin and talks to it
 * over stdio, which is what proves stdout carries the protocol and nothing else.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer, type McpOptions, type McpServer } from "../src/commands/mcp.ts";
import { main } from "../src/main.ts";
import { edit, example, RECORD, REPO, run, snapshot } from "./helpers.ts";

interface Serving {
  url: string;
  output: () => string;
  stop: () => Promise<number>;
}

async function serve(cwd: string, ...argv: string[]): Promise<Serving> {
  const controller = new AbortController();
  let out = "";
  let err = "";
  let ready: (url: string) => void = () => {};
  const listening = new Promise<string>((resolve) => {
    ready = resolve;
  });
  const io = {
    stdout: (s: string) => {
      out += s;
      const match = / at (http:\/\/\S+)\n/.exec(out);
      if (match !== null) ready(match[1]);
    },
    stderr: (s: string) => {
      err += s;
    },
    cwd,
    signal: controller.signal,
  };
  const running = main(["serve", "--port", "0", ...argv], io);
  const url = await Promise.race([
    listening,
    running.then((code) => {
      throw new Error(`serve exited ${code} before listening: ${err}`);
    }),
  ]);
  return {
    url,
    output: () => out,
    stop: () => {
      controller.abort();
      return running;
    },
  };
}

/** A request with the path sent exactly as written, so `..` reaches the server unnormalized. */
function raw(url: string, path: string, method = "GET"): Promise<{ status: number; type: string; body: string }> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, path, method, agent: false }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () =>
        resolve({ status: response.statusCode ?? 0, type: String(response.headers["content-type"] ?? ""), body }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

test("serve prints the URL, the snapshot and the warning, serves the Atlas, and refuses everything else", async (t) => {
  const dir = await example(t);
  const serving = await serve(dir);
  t.after(() => serving.stop());
  assert.match(serving.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const lines = serving.output().split("\n");
  assert.equal(lines[0], `Intentset Atlas for example/lantern at ${serving.url}`);
  assert.match(lines[1], /^Snapshot: no commit \(.+\), graph [0-9a-f]{64}$/);
  assert.match(lines[2], /^13 artifacts, 4 errors, 0 warnings at L2; no run records were given or found/);
  assert.match(serving.output(), /not for publication/);

  const index = await raw(serving.url, "/");
  assert.equal(index.status, 200);
  assert.equal(index.type, "text/html; charset=utf-8");
  assert.match(index.body, /not for publication/i);
  assert.equal((await raw(serving.url, "/atlas.css")).type, "text/css; charset=utf-8");
  assert.equal((await raw(serving.url, "/behaviors/BEH-ASMT-SCHEDULE.html")).status, 200);
  assert.equal((await raw(serving.url, "/verification.html")).status, 200);

  for (const path of [
    "/../.intentset/config.yaml",
    "/..%2f.intentset%2fconfig.yaml",
    "/%2e%2e/%2e%2e/package.json",
    "/behaviors/../../product/scheduling/PRD-LANTERN.md",
    "/product/scheduling/PRD-LANTERN.md",
    "/.intentset/registries.yaml",
    "//etc/passwd",
    "/index.html%00.css",
  ]) {
    const response = await raw(serving.url, path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body, "Not an Atlas page.\n", path);
  }
  for (const method of ["POST", "PUT", "DELETE"]) {
    assert.equal((await raw(serving.url, "/", method)).status, 405, method);
  }
  assert.equal(await serving.stop(), 0);
});

test("serve rebuilds when a record changes, so a reload shows the edit, and writes nothing", async (t) => {
  const dir = await example(t);
  const before = snapshot(dir);
  const serving = await serve(dir);
  t.after(() => serving.stop());
  const page = "/behaviors/BEH-ASMT-SCHEDULE.html";
  assert.doesNotMatch((await raw(serving.url, page)).body, /for a class/);
  await raw(serving.url, "/");
  assert.doesNotMatch(serving.output(), /^rebuilt:/m, "nothing changed, so nothing was rebuilt");

  edit(dir, "BEH-ASMT-SCHEDULE", "title: Schedule an assessment\n", "title: Schedule an assessment for a class\n");
  edit(dir, "BEH-ASMT-SCHEDULE", "# Schedule an assessment\n", "# Schedule an assessment for a class\n");
  assert.match((await raw(serving.url, page)).body, /Schedule an assessment for a class/);
  assert.match(serving.output(), /^rebuilt: product\/scheduling\/BEH-ASMT-SCHEDULE\.md changed\. Snapshot: /m);
  assert.equal(await serving.stop(), 0);

  const after = snapshot(dir);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), "serve creates no file");
});

test("serve --out writes the Atlas and exits, the same bytes twice, never into scope or over files", async (t) => {
  const dir = await example(t);
  const first = await run(dir, "serve", "--out", "dist/atlas");
  assert.equal(first.code, 1, "the example has L2 errors, and the Atlas shows them");
  assert.match(first.out, /^Wrote the Atlas, \d+ files, to dist\/atlas$/m);
  assert.match(first.out, /not for publication/);
  const files = readdirSync(join(dir, "dist", "atlas"), { recursive: true })
    .map(String)
    .sort();
  assert.ok(files.includes("index.html") && files.includes("atlas.css"));
  assert.ok(files.includes(join("behaviors", "BEH-ASMT-SCHEDULE.html")));
  const second = await run(dir, "serve", "--out", "dist/again");
  assert.equal(second.code, 1);
  for (const file of files.filter((f) => f.includes("."))) {
    assert.equal(
      readFileSync(join(dir, "dist", "again", file), "utf8"),
      readFileSync(join(dir, "dist", "atlas", file), "utf8"),
      file,
    );
  }

  const notEmpty = await run(dir, "serve", "--out", "dist/atlas");
  assert.equal(notEmpty.code, 2);
  assert.match(notEmpty.err, /is not empty/);
  const inScope = await run(dir, "serve", "--out", "product/atlas");
  assert.equal(inScope.code, 2);
  assert.match(inScope.err, /inside the documents' scope/);
  assert.equal((await run(dir, "serve", "--port", "http")).code, 2);
});

async function connect(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "intentset-cli-test", version: "0.0.0" });
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
  return client;
}

function build(dir: string, options: Partial<McpOptions>): { server: McpServer | number; out: string; err: string } {
  let out = "";
  let err = "";
  const io = { stdout: (s: string) => (out += s), stderr: (s: string) => (err += s), cwd: dir };
  const server = buildMcpServer(
    { includeRestricted: false, flags: [], authorizedInternal: false, authorizedRestricted: false, ...options },
    { carrier: "markset", level: "L1" },
    io,
  );
  return { server, out, err };
}

const REQUEST = {
  visibility: "customer",
  audience: "teacher",
  product: "PRD-LANTERN",
  release: "pilot-1",
  role: "teacher",
  edition: "standard",
};

function text(result: unknown): string {
  return (result as { content: { text: string }[] }).content[0].text;
}

test("mcp engineering serves the four context tools over the graph, and every result names the snapshot", async (t) => {
  const dir = await example(t);
  const built = build(dir, { mode: "engineering" });
  assert.notEqual(typeof built.server, "number", built.err);
  assert.equal(built.out, "", "nothing on stdout but the protocol");
  assert.match(built.err, /^intentset mcp: engineering context for example\/lantern over stdio \(13 artifacts/);
  const client = await connect(built.server as McpServer);
  t.after(() => client.close());
  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  assert.deepEqual(tools, ["intentset_context", "intentset_impact", "intentset_lookup", "intentset_search"]);
  const lookup = JSON.parse(
    text(await client.callTool({ name: "intentset_lookup", arguments: { id: "BEH-ASMT-SCHEDULE" } })),
  );
  const graphHash = /graph ([0-9a-f]{64})/.exec(built.err)?.[1];
  assert.deepEqual(lookup.snapshot, { commit: null, graphHash });
  assert.deepEqual(lookup.sources, ["product/scheduling/BEH-ASMT-SCHEDULE.md"]);
});

test("mcp customer serves only the two knowledge tools over one publication", async (t) => {
  const dir = await example(t);
  const pins = ["BEH-ASMT-SCHEDULE", "RULE-ASMT-AUTH", "RULE-ASMT-FUTURE"].map(
    (id) =>
      `        ${id}: ${createHash("sha256")
        .update(readFileSync(RECORD(dir, id)))
        .digest("hex")}`,
  );
  edit(dir, "KB-ASMT-SCHEDULE", "  status: draft\n", "  status: approved\n");
  edit(
    dir,
    "KB-ASMT-SCHEDULE",
    "  revision: 1\n",
    `  revision: 1\n  reviewedBy: team-assessment\n  reviewedAt: '2026-10-02'\n  extensions:\n    intentset.org/review:\n      sources:\n${pins.join("\n")}\n`,
  );
  const built = build(dir, { mode: "customer", ...REQUEST });
  assert.notEqual(typeof built.server, "number", built.err);
  assert.equal(built.out, "");
  assert.match(built.err, /customer knowledge over stdio: 1 published document for a customer projection/);
  const client = await connect(built.server as McpServer);
  t.after(() => client.close());
  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  assert.deepEqual(tools, ["knowledge_get", "knowledge_search"]);
  const found = text(await client.callTool({ name: "knowledge_search", arguments: { query: "release time" } }));
  assert.match(found, /KB-ASMT-SCHEDULE/);
  for (const internal of ["Schedule an assessment", "Require a future release time", "BEH-ASMT-SCHEDULE.md"]) {
    assert.ok(!found.includes(internal), internal);
  }
});

test("mcp customer refuses before any server starts: a refused request, a failing graph, the wrong mode's options", async (t) => {
  const dir = await example(t);
  const partial = build(dir, { mode: "customer", visibility: "customer", audience: "teacher" });
  assert.equal(partial.server, 1);
  assert.equal(partial.out, "");
  assert.match(partial.err, /PUB001/);
  assert.match(partial.err, /refused: the publisher refused the request/);

  edit(dir, "BEH-ASMT-SCHEDULE", /- RULE-ASMT-AUTH$/m, "- RULE-ASMT-MISSING");
  const broken = build(dir, { mode: "customer", ...REQUEST });
  assert.equal(broken.server, 1);
  assert.match(broken.err, /refused: validation has 1 error, so nothing is published/);

  for (const [argv, message] of [
    [["mcp"], /the modes are engineering and customer/],
    [["mcp", "--mode", "engineering", "--visibility", "customer"], /belong to --mode customer/],
    [["mcp", "--mode", "customer", "--visibility", "internal"], /public or customer projection only/],
    [["mcp", "--mode", "customer", "--include-restricted"], /belongs to --mode engineering/],
  ] as const) {
    const result = await run(dir, ...argv);
    assert.equal(result.code, 2, argv.join(" "));
    assert.match(result.err, message);
    assert.equal(result.out, "");
  }
});

test("the real bin speaks MCP on stdout and nothing else", async (t) => {
  const dir = await example(t);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--conditions=intentset-source",
      join(REPO, "packages", "cli", "src", "intentset.ts"),
      "mcp",
      "--mode",
      "engineering",
    ],
    cwd: dir,
    stderr: "pipe",
  });
  const client = new Client({ name: "intentset-cli-test", version: "0.0.0" });
  await client.connect(transport);
  t.after(() => client.close());
  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  assert.equal(tools.length, 4);
  const impact = JSON.parse(
    text(await client.callTool({ name: "intentset_impact", arguments: { id: "RULE-ASMT-FUTURE" } })),
  );
  assert.match(impact.snapshot.graphHash, /^[0-9a-f]{64}$/);
});
