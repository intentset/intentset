/**
 * Prepares a release: writes the new version into every place that carries it.
 *
 *   pnpm run release:prepare <version> [--date YYYY-MM-DD] [--allow-dirty]
 *
 * It changes, and refuses to run when any of them does not carry the current
 * version (that is drift to fix first, not to paper over):
 *
 *   - `version` in the root manifest, every `packages/<name>/package.json` and
 *     `site/package.json`, and every `^<version>` range on an `@intentset/*`
 *     sibling in them;
 *   - the same ranges as `specifier`s in `pnpm-lock.yaml`;
 *   - `VERSION` in `packages/mcp/src/index.ts`;
 *   - the header of `.intentset/agents.md`;
 *   - `implementation` in the frontmatter of every specification in `spec/`;
 *   - `## Unreleased` in `CHANGELOG.md`, which becomes `## <version> — <date>`.
 *
 * It never commits, tags or publishes. A release is the v<version> tag, with
 * the message <version>, pushed after this change is reviewed and merged; `.github/workflows/release.yml`
 * publishes from the tag. Prose that names a version, such as the site's
 * roadmap, is written by hand.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface PrepareOptions {
  /** The version being released, such as 0.17.1. */
  to: string;
  /** The release date, YYYY-MM-DD. */
  date: string;
}

export interface Prepared {
  from: string;
  to: string;
  /** Each changed file's new text, by path relative to the repository root, sorted. */
  files: Map<string, string>;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(-[a-z]+\.\d+)?$/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** -1, 0 or 1. A prerelease sorts before its release; prereleases compare by text. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`not a version: ${pa ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return Math.sign(d);
  }
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  return pa[4] < pb[4] ? -1 : 1;
}

/** Replaces `pattern` in `text`, and throws naming `path` and `what` when it does not occur. */
function replaceRequired(path: string, text: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(text)) throw new Error(`${path}: ${what} not found`);
  pattern.lastIndex = 0;
  return text.replace(pattern, replacement);
}

/**
 * The new text of every file a release changes, from the current text of the
 * files it reads. Pure: `read` is the only input, so the tests run it over
 * fixtures. Throws, changing nothing, when a carrier is missing the current
 * version or the changelog has no Unreleased entry.
 */
export function prepareRelease(read: (path: string) => string, paths: string[], options: PrepareOptions): Prepared {
  const { to, date } = options;
  if (!SEMVER.test(to)) throw new Error(`${to} is not a version (expected 1.2.3 or 1.2.3-beta.1)`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error(`${date} is not a date (expected YYYY-MM-DD)`);

  const from = (JSON.parse(read("package.json")) as { version: string }).version;
  if (compareVersions(to, from) <= 0) throw new Error(`${to} is not after the current version ${from}`);

  const old = escapeRegExp(from);
  const files = new Map<string, string>();

  for (const path of paths) {
    const text = read(path);
    let next: string;
    if (path.endsWith("package.json")) {
      next = replaceRequired(
        path,
        text,
        new RegExp(`^(  "version": )"${old}"`, "mu"),
        `$1"${to}"`,
        `"version": "${from}"`,
      );
      next = next.replace(new RegExp(`("@intentset/[a-z-]+": )"\\^${old}"`, "gu"), `$1"^${to}"`);
      const stale = /"@intentset\/[a-z-]+": "\^?([^"]+)"/gu;
      for (const m of next.matchAll(stale)) {
        // The root links siblings as workspace:*, which names no version.
        if (!m[1].startsWith("workspace:") && m[1] !== to) throw new Error(`${path}: ${m[0]} is not on ${from}`);
      }
    } else if (path === "pnpm-lock.yaml") {
      next = text.replace(new RegExp(`('@intentset/[a-z-]+':\\n\\s+specifier: )\\^${old}$`, "gmu"), `$1^${to}`);
      const stale = /'@intentset\/[a-z-]+':\n\s+specifier: (\S+)$/gmu;
      for (const m of next.matchAll(stale)) {
        if (!m[1].startsWith("workspace:") && m[1] !== `^${to}`)
          throw new Error(`${path}: an @intentset specifier is ${m[1]}, not ^${from}`);
      }
    } else if (path === "packages/mcp/src/index.ts") {
      next = replaceRequired(
        path,
        text,
        new RegExp(`^(export const VERSION = )"${old}";`, "mu"),
        `$1"${to}";`,
        `VERSION = "${from}"`,
      );
    } else if (path === ".intentset/agents.md") {
      next = replaceRequired(
        path,
        text,
        new RegExp(`\\(intentset ${old}\\)`, "u"),
        `(intentset ${to})`,
        `"(intentset ${from})"`,
      );
    } else if (path.startsWith("spec/") && path.endsWith(".md")) {
      next = replaceRequired(
        path,
        text,
        new RegExp(`^(---\\n(?:.*\\n)*?implementation: )${old}$`, "mu"),
        `$1${to}`,
        `implementation: ${from} in the frontmatter`,
      );
    } else if (path === "CHANGELOG.md") {
      next = replaceRequired(path, text, /^## Unreleased$/mu, `## ${to} — ${date}`, "## Unreleased");
      const entry = next.split(/^## /mu)[1] ?? "";
      if (entry.split("\n").slice(1).join("\n").trim() === "")
        throw new Error(`${path}: the Unreleased entry is empty`);
    } else {
      throw new Error(`${path}: no rule for this file`);
    }
    if (next !== text) files.set(path, next);
  }

  return { from, to, files: new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
}

/** Every file a release reads, relative to `root`, sorted. */
export function releasePaths(root: string): string[] {
  const dirs = readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `packages/${e.name}/package.json`);
  const specs = readdirSync(join(root, "spec"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `spec/${f}`);
  return [
    ".intentset/agents.md",
    "CHANGELOG.md",
    "package.json",
    ...dirs,
    "packages/mcp/src/index.ts",
    "pnpm-lock.yaml",
    "site/package.json",
    ...specs,
  ].sort();
}

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function main(argv: string[]): number {
  const args = [...argv];
  const allowDirty = args.includes("--allow-dirty");
  const dateAt = args.indexOf("--date");
  const date = dateAt === -1 ? today() : args[dateAt + 1];
  const to = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--date");
  if (!to || date === undefined) {
    process.stderr.write("usage: pnpm run release:prepare <version> [--date YYYY-MM-DD] [--allow-dirty]\n");
    return 2;
  }

  const root = resolve(import.meta.dirname, "..");
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" });
  if (dirty.trim() !== "" && !allowDirty) {
    process.stderr.write(
      "release:prepare: tracked files have uncommitted changes; commit them or pass --allow-dirty\n",
    );
    return 1;
  }

  let prepared: Prepared;
  try {
    prepared = prepareRelease((p) => readFileSync(join(root, p), "utf8"), releasePaths(root), { to, date });
  } catch (error) {
    process.stderr.write(`release:prepare: ${(error as Error).message}; nothing was written\n`);
    return 1;
  }

  for (const [path, text] of prepared.files) writeFileSync(join(root, path), text);
  process.stdout.write(
    [
      `${prepared.from} → ${prepared.to}, ${prepared.files.size} files:`,
      ...[...prepared.files.keys()].map((p) => `  ${p}`),
      "",
      "Next: read the changelog entry, write any prose that names the version (site/content/roadmap.md),",
      "run pnpm test and pnpm run conformance, and open the release pull request. After it merges, tag the",
      "merged main. The tag carries a message, as every earlier one does, because a signed tag",
      "(tag.gpgsign) needs one and git stops without it:",
      `  git checkout main && git pull && git tag -m ${prepared.to} v${prepared.to} && git push origin v${prepared.to}`,
      "",
    ].join("\n"),
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
