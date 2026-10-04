/**
 * `intentset serve` (Core §10): the Atlas over HTTP on this machine. The
 * level pipeline runs as validate's does, at the highest level the inputs
 * allow, and the Atlas is built from what it found. Requests are answered
 * from that in-memory build and nothing else: GET only, the Atlas's own
 * paths and atlas.css, 404 for any other path, so there is no file system
 * behind the server to traverse. Before answering, any file the build read
 * that has changed since is noticed and the Atlas rebuilt, so an edited
 * record shows on reload.
 *
 * `--out <dir>` writes the same files to a new or empty directory outside
 * the documents' scope and exits. The Atlas carries internal and restricted
 * records, and says so: it is a review surface, never a publication.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { ARCHITECTURE_CONFIG_PATH } from "@intentset/architecture";
import { buildAtlas } from "@intentset/atlas";
import { count, type Io, snapshotLine } from "../output.ts";
import { outputDirProblem, outputProblem } from "../outputs.ts";
import { CONFIG_PATH } from "../repository.ts";
import { EVIDENCE_DIR, evidenceFiles, openSession, type Session, type SessionOptions } from "../session.ts";
import { TEXT_EXTENSIONS } from "../tree.ts";

export const NOT_FOR_PUBLICATION =
  "The Atlas shows internal and restricted records: it is a review surface and is not for publication.";

export interface ServeOptions {
  port: number;
  host: string;
  out?: string;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/** The Atlas built from a session. */
export function atlasOf(session: Session): Map<string, string> {
  return buildAtlas({
    graph: session.result.graph,
    registries: session.repo.registries,
    diagnostics: session.diagnostics,
    snapshot: {
      commit: session.snapshot.commit,
      graphHash: session.snapshot.graphHash,
      scope: session.repo.config.scope,
      level: session.level,
    },
    evidence:
      session.evidence === undefined
        ? null
        : { classification: session.evidence.check.classification, coverage: session.evidence.check.coverage },
    architecture:
      session.architecture === undefined
        ? null
        : {
            diagnostics: session.architecture.diagnostics,
            summary: session.architecture.summary as unknown as Record<string, unknown>,
          },
  });
}

/**
 * Every file a build read as text, and the directories holding them, absolute:
 * a different modification time or size on any of them means rebuild. A
 * directory's time changes when a file is added to it or removed, which is how
 * a new record is noticed.
 */
function watched(session: Session, evidence: readonly string[]): string[] {
  const { repo } = session;
  const files = new Set<string>([
    join(repo.root, CONFIG_PATH),
    join(repo.root, ARCHITECTURE_CONFIG_PATH),
    join(repo.root, EVIDENCE_DIR),
    ...evidence,
    ...repo.inputs.map((input) => join(repo.root, input.path)),
    // Only what a check reads as text: a log or an image beside the sources cannot change the Atlas.
    ...[...(session.tree?.paths ?? [])]
      .filter((path) => TEXT_EXTENSIONS.some((extension) => path.endsWith(extension)))
      .map((path) => join(repo.root, path)),
  ]);
  if (repo.config.registries !== null) files.add(join(repo.root, repo.config.registries));
  // A file added to or removed from a directory changes the directory's time.
  for (const file of [...files]) {
    for (let dir = dirname(file); dir.startsWith(repo.root); dir = dirname(dir)) {
      files.add(dir);
      if (dir === repo.root) break;
    }
  }
  return [...files];
}

/**
 * Each path's modification time and size, or "absent". Compared with itself
 * later rather than with a clock: a wall-clock start time in whole milliseconds
 * is earlier than a file written in the same millisecond, and a file system's
 * clock is coarser than the process's, so comparing the two calls a file
 * written before the build "changed" (the 0.3.0 release run did, on Linux).
 */
function stamps(paths: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const path of paths) out.set(path, stamp(path));
  return out;
}

function stamp(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    // Absent: a file the build read was removed, or an optional file never existed.
    return "absent";
  }
}

function changedSince(recorded: ReadonlyMap<string, string>): string | null {
  for (const [path, before] of recorded) if (stamp(path) !== before) return path;
  return null;
}

/** The atlas path a request names, or null when it names none. Nothing here touches the file system. */
export function requestPath(url: string | undefined): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url ?? "/", "http://localhost").pathname);
  } catch {
    return null;
  }
  const path = pathname.replace(/^\/+/, "");
  return path === "" || path.endsWith("/") ? `${path}index.html` : path;
}

export async function serveCommand(options: ServeOptions, sessionOptions: SessionOptions, io: Io): Promise<number> {
  const given = sessionOptions.evidence;
  const first = openSession("serve", sessionOptions, io);
  if (typeof first === "number") return first;
  let session: Session = first;
  let atlas: Map<string, string>;
  try {
    atlas = atlasOf(session);
  } catch (error) {
    io.stderr(`intentset serve: the Atlas could not be built: ${(error as Error).message}\n`);
    return 2;
  }
  const evidence = () => evidenceFiles(session.repo.root, io.cwd, given);
  let paths = watched(session, evidence());
  let recorded = stamps(paths);
  const levelLine = `${count(session.result.graph.artifacts.size, "artifact")}, ${count(session.errors, "error")}, ${count(session.warnings, "warning")} at ${session.level}${
    session.evidence === undefined
      ? `; no run records were given or found in ${EVIDENCE_DIR}/, so L3 was not checked`
      : ""
  }`;

  if (options.out !== undefined) return writeAtlas(session, atlas, options.out, levelLine, io);

  /** Rebuild when a file the last build read has changed; keep serving the last good build if a rebuild fails. */
  const refresh = (): string | null => {
    const changed = changedSince(recorded);
    if (changed === null) return null;
    // Stamped before the build reads anything, so an edit made while it runs shows as a change next time.
    const before = stamps(paths);
    const next = openSession("serve", sessionOptions, io);
    if (typeof next === "number") return "the repository could not be read; the terminal says why";
    try {
      atlas = atlasOf(next);
    } catch (error) {
      return `the Atlas could not be built: ${(error as Error).message}`;
    }
    session = next;
    paths = watched(session, evidence());
    const after = stamps(paths);
    for (const [path, value] of before) if (after.has(path)) after.set(path, value);
    recorded = after;
    io.stdout(
      `rebuilt: ${changed.slice(session.repo.root.length + 1) || "."} changed. ${snapshotLine(session.snapshot)}\n`,
    );
    return null;
  };

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
    };
    if (request.method !== "GET") {
      response.writeHead(405, { ...headers, Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Only GET is served.\n");
      return;
    }
    const failure = refresh();
    if (failure !== null) {
      response.writeHead(500, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      response.end(`The Atlas was not rebuilt: ${failure}.\n`);
      return;
    }
    const path = requestPath(request.url);
    const body = path === null ? undefined : atlas.get(path);
    if (path === null || body === undefined) {
      response.writeHead(404, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not an Atlas page.\n");
      return;
    }
    const type = TYPES[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream";
    response.writeHead(200, { ...headers, "Content-Type": type });
    response.end(body);
  };

  const server = createServer(handle);
  return new Promise<number>((done) => {
    server.once("error", (error) => {
      io.stderr(`intentset serve: could not listen on ${options.host}:${options.port}: ${error.message}\n`);
      done(2);
    });
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : options.port;
      const host = options.host.includes(":") ? `[${options.host}]` : options.host;
      io.stdout(
        [
          `Intentset Atlas for ${session.repo.config.repository} at http://${host}:${port}/`,
          snapshotLine(session.snapshot),
          levelLine,
          NOT_FOR_PUBLICATION,
          "Pages are rebuilt when a file they were built from changes: edit a record and reload. Interrupt to stop.",
          "",
        ].join("\n"),
      );
      const stop = () => {
        server.close(() => done(0));
        server.closeIdleConnections();
      };
      if (io.signal?.aborted) stop();
      else io.signal?.addEventListener("abort", stop, { once: true });
    });
  });
}

function writeAtlas(session: Session, atlas: Map<string, string>, out: string, levelLine: string, io: Io): number {
  const dir = resolve(io.cwd, out);
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    // Absent: it will be created.
  }
  if (entries.length > 0) {
    io.stderr(`intentset serve: --out ${out} is not empty; write the Atlas into a new or empty directory.\n`);
    return 2;
  }
  const where = outputDirProblem(session.repo, dir);
  if (where !== null) {
    io.stderr(`intentset serve: --out ${out} ${where}.\n`);
    return 2;
  }
  for (const path of atlas.keys()) {
    const problem = outputProblem(session.repo, join(dir, path));
    if (problem !== null) {
      io.stderr(`intentset serve: --out ${out}: ${path} ${problem}; nothing was written.\n`);
      return 2;
    }
  }
  for (const [path, text] of atlas) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text, { flag: "wx" });
  }
  io.stdout(
    [
      `Wrote the Atlas, ${count(atlas.size, "file")}, to ${out}`,
      snapshotLine(session.snapshot),
      levelLine,
      NOT_FOR_PUBLICATION,
      "",
    ].join("\n"),
  );
  return session.errors > 0 ? 1 : 0;
}
