/**
 * Development server for the site, after Markset's site/serve.ts without the
 * reload client. Serves dist/, rebuilds when anything the build reads changes.
 * Node built-ins only, so there is nothing to install.
 *
 *   npm run site:watch -- --port 4000
 */
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "dist");

/** Watched for changes, relative to the repository root: everything the build reads. */
export const WATCHED = ["site", "spec", "examples", "docs/requirements/roadmap"];

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/** Media type for a served path; unknown extensions download rather than render. */
export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Resolve a request path to a file inside dist/. Directory paths get index.html.
 * Returns null for anything that would escape the output directory.
 */
export function resolveRequest(urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = join(out, normalize(rel));
  if (file !== out && !file.startsWith(out + sep)) return null;
  return file;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? "/";
  let file = resolveRequest(url);
  if (file === null) {
    res.writeHead(403).end("forbidden\n");
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": contentType(file),
      "cache-control": "no-store",
      "content-length": body.byteLength,
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`not found: ${url}\n`);
  }
}

/**
 * Run the build in a child process rather than calling build() here: Node
 * caches modules, so an in-process rebuild would keep serving build.ts as it
 * was when this server started.
 */
function rebuild(): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--conditions=intentset-source", join(root, "site", "build.ts")], {
      stdio: ["ignore", "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0) process.stderr.write(`site: build failed\n${stderr}`);
      done(code === 0);
    });
  });
}

function startWatching(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let queued = false;

  const flush = async (): Promise<void> => {
    if (building) {
      queued = true;
      return;
    }
    building = true;
    const ok = await rebuild();
    building = false;
    if (ok) process.stdout.write("site: rebuilt\n");
    if (queued) {
      queued = false;
      await flush();
    }
  };

  const onChange = (file: string | null): void => {
    if (!file) return;
    const name = file.split(/[\\/]/).pop() ?? file;
    // Editors write temporary siblings while saving; they are not sources.
    if (name.startsWith(".") || name.endsWith("~") || /^\d+$/.test(name)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, 50);
  };

  for (const target of WATCHED) {
    try {
      watch(join(root, target), { recursive: true }, (_event, file) => onChange(file ?? target));
    } catch (error) {
      process.stderr.write(`site: cannot watch ${target}: ${(error as Error).message}\n`);
    }
  }
}

async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { port: { type: "string", default: "3003" } } });
  const port = Number(values.port);
  process.stdout.write("site: building\n");
  if (!(await rebuild())) process.exitCode = 1;
  startWatching();
  createServer((req, res) => {
    void handle(req, res);
  }).listen(port, () => {
    process.stdout.write(`site: http://localhost:${port} — watching for changes\n`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await main(process.argv.slice(2));
}
