/**
 * `intentset migrate --to 0.2` (Core §1): moves the records the model reads from the specifications' `0.1` to `0.2`
 * by rewriting two values in each record's frontmatter, `intentset.spec` and `intentset.profile`, which Core §4
 * requires to agree with it. It reads the same records every other command reads (the files the configured scope
 * matches), changes those two lines and nothing else, byte for byte, and keeps the quoting each line used. A tree
 * with uncommitted changes to tracked files is refused unless `--allow-dirty` says otherwise, so the rewrite is a
 * diff of its own that git can undo. Other files (`.intentset/agents.md`, which carries an example record) are not
 * records and are left to their author.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sortDiagnostics } from "@intentset/core";
import { trackedChanges } from "../git.ts";
import { formatDiagnostic, type Io } from "../output.ts";
import { type CarrierName, CONFIG_PATH, findRoot, loadRepository } from "../repository.ts";

/** The specification versions this command moves between. */
export const MIGRATE_FROM = "0.1";
export const MIGRATE_TO = "0.2";

export interface MigrateOptions {
  root?: string;
  to?: string;
  allowDirty?: boolean;
  carrier: CarrierName;
}

/** A message when the options cannot be run, before anything is read; null when they can. */
export function migrateUsageProblem(options: Pick<MigrateOptions, "to">): string | null {
  if (options.to === undefined) return `--to is required: the only target is ${MIGRATE_TO}, from ${MIGRATE_FROM}`;
  if (options.to !== MIGRATE_TO) {
    return `--to ${options.to}: the only target is ${MIGRATE_TO}, which moves records written for ${MIGRATE_FROM}`;
  }
  return null;
}

const SPEC_LINE = /^(\s+spec:\s*)(['"]?)(\d+\.\d+)\2(\s*(?:#.*)?)$/;
const PROFILE_LINE = /^(\s+profile:\s*)(['"]?)intentset\/([a-z0-9-]+)\/(\d+\.\d+)\2(\s*(?:#.*)?)$/;

/**
 * The record's text moved from `from` to `to`, or null when it declares another value. Only lines inside the
 * `intentset:` mapping of the frontmatter, and only `spec` and `profile`, are rewritten; line endings are kept.
 */
export function migrateText(
  source: string,
  frontmatter: { line: number; text: string },
  from: string,
  to: string,
): string | null {
  const lines = source.split("\n");
  const first = frontmatter.line - 1;
  const last = first + frontmatter.text.split("\n").length;
  let inIntentset = false;
  let childIndent: number | null = null;
  let specSeen = false;
  const edits = new Map<number, string>();
  for (let i = first; i < last && i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const eol = raw.endsWith("\r") ? "\r" : "";
    if (/^\S/.test(line)) {
      inIntentset = /^intentset:\s*(#.*)?$/.test(line);
      childIndent = null;
      continue;
    }
    if (!inIntentset || line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    childIndent ??= indent;
    if (indent !== childIndent) continue;
    const spec = SPEC_LINE.exec(line);
    if (spec !== null) {
      if (spec[3] !== from) return null;
      specSeen = true;
      edits.set(i, `${spec[1]}${spec[2]}${to}${spec[2]}${spec[4]}${eol}`);
      continue;
    }
    const profile = PROFILE_LINE.exec(line);
    if (profile !== null && profile[4] === from) {
      edits.set(i, `${profile[1]}${profile[2]}intentset/${profile[3]}/${to}${profile[2]}${profile[5]}${eol}`);
    }
  }
  if (!specSeen) return null;
  for (const [i, text] of edits) lines[i] = text;
  return lines.join("\n");
}

export function migrateCommand(options: MigrateOptions, io: Io): number {
  const root = findRoot(io.cwd, options.root);
  if (root === null) {
    const where = options.root === undefined ? "this directory or any above it" : options.root;
    io.stderr(`intentset migrate: no ${CONFIG_PATH} in ${where}.\n`);
    return 2;
  }
  if (options.allowDirty !== true) {
    const changes = trackedChanges(root);
    if (changes === null) {
      io.stderr(
        "intentset migrate: this is not a git work tree, so the rewrite could not be undone; pass --allow-dirty to migrate anyway.\n",
      );
      return 2;
    }
    if (changes.length > 0) {
      io.stderr(
        `intentset migrate: ${changes.length} tracked file${changes.length === 1 ? " has" : "s have"} uncommitted changes. ` +
          "Commit or stash them so the rewrite is a diff on its own, or pass --allow-dirty.\n",
      );
      return 2;
    }
  }
  const repo = loadRepository(root, options.carrier);
  if (!repo.configOk) {
    io.stderr("intentset migrate: the configuration has errors, so the scope is unknown.\n");
    for (const d of sortDiagnostics(repo.diagnostics)) io.stderr(formatDiagnostic(d));
    return 2;
  }
  let moved = 0;
  let current = 0;
  let other = 0;
  for (const input of repo.inputs) {
    if (input.frontmatter === null) continue;
    const text = migrateText(input.source, input.frontmatter, MIGRATE_FROM, MIGRATE_TO);
    if (text === null) {
      if (/^\s+spec:\s*['"]?0\.2['"]?\s*(#.*)?$/m.test(input.frontmatter.text)) current++;
      else other++;
      continue;
    }
    if (text === input.source) continue;
    writeFileSync(join(root, input.path), text);
    moved++;
  }
  io.stdout(
    `intentset migrate: moved ${moved} record${moved === 1 ? "" : "s"} from ${MIGRATE_FROM} to ${MIGRATE_TO}` +
      `${current > 0 ? `; ${current} already ${MIGRATE_TO}` : ""}${other > 0 ? `; ${other} declare neither (left as they are)` : ""}.\n`,
  );
  return 0;
}
