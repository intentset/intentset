/**
 * What the CLI tests share: `main` run in-process with captured io, temporary
 * repositories made by `init --example`, record edits, a byte-and-mtime
 * snapshot of a tree, and git in a temporary repository.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Schema } from "../../conformance/src/harness.ts";
import { main } from "../src/main.ts";

export const REPO = resolve(import.meta.dirname, "..", "..", "..");
export const exportSchema = JSON.parse(readFileSync(join(REPO, "spec", "export.schema.json"), "utf8")) as Schema;

export interface Run {
  code: number;
  out: string;
  err: string;
}

type Context = { after(fn: () => void): void };

export async function run(cwd: string, ...argv: string[]): Promise<Run> {
  let out = "";
  let err = "";
  const code = await main(argv, { stdout: (s) => (out += s), stderr: (s) => (err += s), cwd });
  return { code, out, err };
}

export function temp(t: Context): string {
  const dir = mkdtempSync(join(tmpdir(), "intentset-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * A temporary repository holding Lantern's scheduling example, the conformance suite's baseline: `init`, then its
 * records and registries copied in, as `init --example` wrote them until it moved to the shop (2026-11-26).
 */
export async function example(t: Context): Promise<string> {
  const dir = temp(t);
  const init = await run(dir, "init", "--repository", "example/lantern");
  assert.equal(init.code, 0, init.err);
  const lantern = join(import.meta.dirname, "..", "..", "..", "examples", "scheduling");
  copyFileSync(join(lantern, "registries.yaml"), join(dir, ".intentset", "registries.yaml"));
  mkdirSync(join(dir, "product", "scheduling"), { recursive: true });
  for (const name of readdirSync(lantern).filter((n) => n.endsWith(".md"))) {
    copyFileSync(join(lantern, name), join(dir, "product", "scheduling", name));
  }
  return dir;
}

export const RECORD = (root: string, id: string) => join(root, "product", "scheduling", `${id}.md`);

export function edit(root: string, id: string, from: string | RegExp, to: string): void {
  const file = RECORD(root, id);
  const before = readFileSync(file, "utf8");
  const after = before.replace(from, to);
  assert.notEqual(after, before, `edit of ${id} changed nothing`);
  writeFileSync(file, after);
}

/** Write files into a tree by repository-relative path, creating directories. */
export function write(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

/** Every file under `root` with its bytes and modification time. */
export function snapshot(root: string): Map<string, { bytes: string; mtime: number }> {
  const out = new Map<string, { bytes: string; mtime: number }>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.set(path, { bytes: readFileSync(path).toString("base64"), mtime: statSync(path).mtimeMs });
    }
  };
  walk(root);
  return out;
}

/**
 * git in a test repository. Automatic maintenance is off: after a commit git may
 * start it in the background, and its lock files appearing and vanishing under
 * .git race the tests that snapshot the whole tree (CI, 2026-10-04: ENOENT on
 * .git/objects/maintenance.lock).
 */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "gc.auto=0",
      "-c",
      "maintenance.auto=false",
      ...args,
    ],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/**
 * A record at 0.4 as an earlier version wrote it: `spec` and `profile`, and a knowledge record's `review` under the
 * extension 0.2 read it from (ADR 0025), the example's being `hash: content-v1` and so meaning the same at both.
 */
export function asEarlier(text: string, version: string): string {
  const moved = text
    .replace("spec: '0.4'", `spec: '${version}'`)
    .replace(/(profile: intentset\/[a-z]+\/)0\.4/, `$1${version}`);
  // From 0.3 on the review is the core field, so a record at 0.3 differs from one at 0.4 in those two lines alone.
  if (version !== "0.1" && version !== "0.2") return moved;
  return moved.replace(
    /^ {2}review:\n((?: {4,}.*\n)+)/m,
    (_, block: string) =>
      `  extensions:\n    intentset.org/review:\n${block
        .split("\n")
        .map((line) => (line === "" ? line : `  ${line}`))
        .join("\n")}`,
  );
}

/** The scheduling example as a git repository whose records declare an earlier version, and the same records at 0.4. */
export async function atEarlier(t: Context, version = "0.2") {
  const dir = await example(t);
  const files = readdirSync(join(dir, "product", "scheduling")).filter((name) => name.endsWith(".md"));
  const current = new Map<string, string>();
  for (const name of files) {
    const path = join(dir, "product", "scheduling", name);
    const text = readFileSync(path, "utf8");
    current.set(name, text);
    writeFileSync(path, asEarlier(text, version));
  }
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", `records at ${version}`);
  return { dir, files, current };
}
