/**
 * @intentset/mcp: a read-only Model Context Protocol server (Core §10,
 * milestone M5).
 *
 * The operator fixes the mode when the server is created, and no client
 * argument can change it.
 *
 *   engineering  intentset_lookup, intentset_context, intentset_impact and
 *                intentset_search over one validated graph. Every result
 *                begins with the snapshot and lists its source paths.
 *   customer     knowledge_search and knowledge_get over a publication: the
 *                publisher's documents, its index and their retrieval chunks.
 *                The server is never given the graph in this mode, so it has
 *                no engineering record to leak; nothing else is registered.
 *
 * Built on the SDK's low-level `Server` with JSON Schema inputs, so this
 * package does not import zod. Nothing here writes, executes or reaches the
 * network beyond the transport the caller connects.
 */
import { compareStrings, type Graph, graphHash } from "@intentset/core";
import type { Chunk } from "@intentset/publisher";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { type CustomerPublication, customerTools } from "./customer.ts";
import { type EngineeringSnapshot, engineeringTools } from "./engineering.ts";
import { checkArguments, type Tool } from "./tool.ts";

export { NOT_AVAILABLE, RESULT_LIMIT, type CustomerPublication } from "./customer.ts";
export { NOT_IN_SNAPSHOT, SEARCH_LIMIT, type EngineeringSnapshot } from "./engineering.ts";
export type { Tool, ToolDefinition, ToolResult } from "./tool.ts";

/** The package version, reported to clients as the server's version. A test holds it to package.json. */
export const VERSION = "0.4.0";

export interface EngineeringOptions {
  mode: "engineering";
  graph: Graph;
  /** The snapshot every result names; its graph hash must be the graph's. */
  snapshot: EngineeringSnapshot;
  /** Serve restricted artifacts too. Default false: they read as absent. */
  includeRestricted?: boolean;
}

export interface CustomerOptions {
  mode: "customer";
  /** A publisher PublishResult, or its documents and index. */
  publication: CustomerPublication;
  /** Retrieval chunks of those documents; made with `toChunks` when omitted. */
  chunks?: readonly Chunk[];
  /** Never accepted: customer mode is not given the engineering graph. */
  graph?: never;
}

export type IntentsetServerOptions = EngineeringOptions | CustomerOptions;

/** A read-only MCP server in the mode the operator chose. Throws on options that would make a result untrue. */
export function createIntentsetServer(options: IntentsetServerOptions): Server {
  let tools: Tool[];
  let instructions: string;
  if (options.mode === "engineering") {
    if (graphHash(options.graph) !== options.snapshot.graphHash) {
      throw new Error("mcp: the snapshot's graph hash is not the hash of the graph given");
    }
    tools = engineeringTools({
      graph: options.graph,
      snapshot: { commit: options.snapshot.commit, graphHash: options.snapshot.graphHash },
      includeRestricted: options.includeRestricted === true,
    });
    instructions =
      "Read-only Intentset engineering context. Every result names the snapshot (commit and graph hash) it was " +
      "read from and the repository paths of its sources; the files are authoritative. Load intentset_context " +
      "before changing implementation. Passing validation never approves a release or a publication.";
  } else if (options.mode === "customer") {
    // Only the publication and its chunks are passed on: whatever else the options object carries stays here.
    tools = customerTools(
      { documents: options.publication.documents, index: options.publication.index },
      options.chunks,
    );
    instructions =
      "Published product knowledge for one audience and release. Answer only from these results, cite the " +
      "sources and snapshot they name, say when something is not available, and abstain when nothing matches.";
  } else {
    throw new Error(`mcp: unknown mode ${JSON.stringify((options as { mode?: unknown }).mode)}`);
  }

  const byName = new Map(tools.map((tool) => [tool.definition.name, tool]));
  const server = new Server({ name: "intentset", version: VERSION }, { capabilities: { tools: {} }, instructions });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...byName.keys()].sort(compareStrings).map((name) => (byName.get(name) as Tool).definition),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (tool === undefined) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
    return tool.call(checkArguments(tool.definition, request.params.arguments ?? {}));
  });
  return server;
}

/** Serve over standard input and output until the client disconnects. */
export async function runStdio(server: Server): Promise<void> {
  await server.connect(new StdioServerTransport());
}
