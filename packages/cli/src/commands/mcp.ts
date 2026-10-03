/**
 * `intentset mcp` (Core §10): the read-only MCP server over stdio, in the
 * mode the operator chooses here and no client can change.
 *
 *   engineering  the validated graph: lookup, context, impact and search,
 *                every result naming the snapshot and its source paths
 *   customer     a publication made in memory exactly as `publish` makes
 *                one, and its retrieval chunks; the server is never given
 *                the graph, so it has no engineering record to leak
 *
 * stdout carries the protocol and nothing else: the startup line and every
 * diagnostic go to stderr. A customer request that the publisher refuses,
 * or a graph that does not validate, stops before any server starts.
 */
import { type Visibility, sortDiagnostics } from "@intentset/core";
import { createIntentsetServer, runStdio } from "@intentset/mcp";
import { type PublicationRequest, publish, toChunks } from "@intentset/publisher";
import { count, formatDiagnostic, type Io, snapshotLine } from "../output.ts";
import { openSession, type SessionOptions } from "../session.ts";

export type McpServer = ReturnType<typeof createIntentsetServer>;

export interface McpOptions {
  mode?: string;
  includeRestricted: boolean;
  visibility?: string;
  audience?: string;
  product?: string;
  release?: string;
  role?: string;
  edition?: string;
  flags: string[];
  authorizedInternal: boolean;
  authorizedRestricted: boolean;
  publishedAt?: string;
}

export const MCP_MODES = ["engineering", "customer"] as const;

export function mcpUsageProblem(options: McpOptions): string | null {
  if (options.mode === undefined || !(MCP_MODES as readonly string[]).includes(options.mode)) {
    return `--mode ${options.mode ?? "(missing)"}: the modes are engineering and customer, and one must be chosen`;
  }
  const request = [
    options.visibility,
    options.audience,
    options.product,
    options.release,
    options.role,
    options.edition,
  ].some((value) => value !== undefined);
  if (options.mode === "engineering" && (request || options.flags.length > 0)) {
    return "publication request options belong to --mode customer";
  }
  if (options.mode === "customer") {
    if (options.includeRestricted) return "--include-restricted belongs to --mode engineering";
    if (options.visibility !== undefined && options.visibility !== "public" && options.visibility !== "customer") {
      return `--visibility ${options.visibility}: customer mode serves a public or customer projection only`;
    }
  }
  return null;
}

/** The server the command would run, or the exit code after saying why there is none. Writes only to stderr. */
export function buildMcpServer(options: McpOptions, sessionOptions: SessionOptions, io: Io): McpServer | number {
  const session = openSession("mcp", sessionOptions, io);
  if (typeof session === "number") return session;
  const { result, snapshot, repo } = session;
  const summary = `${count(result.graph.artifacts.size, "artifact")}, ${count(session.errors, "error")}, ${count(session.warnings, "warning")} at ${session.level}`;

  if (options.mode === "engineering") {
    if (!result.ok) {
      io.stderr(`intentset mcp: validation has ${count(session.errors, "error")}; results may be incomplete.\n`);
    }
    try {
      const server = createIntentsetServer({
        mode: "engineering",
        graph: result.graph,
        snapshot: { commit: snapshot.commit, graphHash: snapshot.graphHash },
        includeRestricted: options.includeRestricted,
      });
      io.stderr(
        `intentset mcp: engineering context for ${repo.config.repository} over stdio (${summary}${
          options.includeRestricted ? ", restricted records included" : ", restricted records withheld"
        }). ${snapshotLine(snapshot)}\n`,
      );
      return server;
    } catch (error) {
      io.stderr(`intentset mcp: ${(error as Error).message}\n`);
      return 2;
    }
  }

  if (!result.ok) {
    for (const d of session.diagnostics) io.stderr(formatDiagnostic(d));
    io.stderr(`intentset mcp: refused: validation has ${count(session.errors, "error")}, so nothing is published.\n`);
    return 1;
  }
  const request = {
    visibility: options.visibility as Visibility,
    audience: options.audience,
    product: options.product,
    release: options.release,
    role: options.role,
    edition: options.edition,
    flags: options.flags,
    authorizedInternal: options.authorizedInternal,
    authorizedRestricted: options.authorizedRestricted,
  } as PublicationRequest;
  const published = publish(result.graph, repo.registries, request, {
    snapshot: { commit: snapshot.commit, graphHash: snapshot.graphHash },
    publishedAt: options.publishedAt ?? new Date().toISOString(),
  });
  for (const d of sortDiagnostics(published.diagnostics)) io.stderr(formatDiagnostic(d));
  if (published.index.request === null) {
    io.stderr("intentset mcp: refused: the publisher refused the request, so there is nothing to serve.\n");
    return 1;
  }
  try {
    const documents = published.documents;
    const server = createIntentsetServer({
      mode: "customer",
      publication: { documents, index: published.index },
      chunks: toChunks(documents),
    });
    const r = published.index.request;
    io.stderr(
      `intentset mcp: customer knowledge over stdio: ${count(documents.length, "published document")} for a ${r.visibility} projection, audience ${r.audience}, ${r.product} ${r.release}. ${snapshotLine(snapshot)}\n`,
    );
    return server;
  } catch (error) {
    io.stderr(`intentset mcp: ${(error as Error).message}\n`);
    return 2;
  }
}

export async function mcpCommand(options: McpOptions, sessionOptions: SessionOptions, io: Io): Promise<number> {
  const server = buildMcpServer(options, sessionOptions, io);
  if (typeof server === "number") return server;
  io.signal?.addEventListener("abort", () => void server.close(), { once: true });
  await runStdio(server);
  return 0;
}
