/**
 * `intentset migrate --to 0.3` (Core §1): moves the records the model reads to the specifications' current version,
 * `0.3`, from `0.2` or from `0.1`. A move is a chain of steps, one per version (`MIGRATIONS`): each step rewrites two
 * values in the record's frontmatter, `intentset.spec` and `intentset.profile`, which Core §4 requires to agree with
 * it, and then applies the per-record transforms that version lists, in order. The step to `0.3` has one
 * (`statusToReviewLifecycle`, ADR 0023): a `status` of `implemented` or `released` becomes `approved`, and a record of
 * a type that carries `delivery` and states none gets `delivery: built`, which is what the status claimed. Every
 * other line is left byte for byte, and each rewritten line keeps its quoting, comment and line ending. It reads the same records every other command reads (the files the configured scope matches). A tree with uncommitted
 * changes to tracked files is refused unless `--allow-dirty` says otherwise, so the rewrite is a diff of its own that
 * git can undo. Other files (`.intentset/agents.md`, which carries an example record) are not records and are left to
 * their author.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DELIVERY_TYPES, SPEC_VERSION, sortDiagnostics } from "@intentset/core";
import { trackedChanges } from "../git.ts";
import { formatDiagnostic, type Io } from "../output.ts";
import { type CarrierName, CONFIG_PATH, findRoot, loadRepository } from "../repository.ts";

/** Where a record's frontmatter is: its first line (1-based) and its text between the fences. */
export interface FrontmatterSpan {
  line: number;
  text: string;
}

/**
 * One rewrite a step applies to a record after moving its `spec` and `profile`: the record's whole text in, the
 * whole text out. It changes only what its version requires and returns the text unchanged when there is nothing to
 * do, so a step is safe to run on any record at its `from` version.
 */
export type RecordTransform = (source: string, frontmatter: FrontmatterSpan) => string;

/** One version's move: the records at `from` become records at `to`. */
export interface MigrationStep {
  from: string;
  to: string;
  /** Applied in order after `spec` and `profile` are rewritten. */
  transforms: readonly RecordTransform[];
}

const STATUS_LINE = /^(\s+status:\s*)(['"]?)(implemented|released)\2(\s*(?:#.*)?)$/;
const TYPE_LINE = /^\s+type:\s*(['"]?)([a-z]+)\1\s*(?:#.*)?$/;
const DELIVERY_LINE = /^\s+delivery:/;

/**
 * Core §7 at `0.3` (ADR 0023): `status` is the review lifecycle only. A record whose status is `implemented` or
 * `released` becomes `approved`; when its type carries `delivery` and it states none, `delivery: built` is written on
 * the line after its status, at the same indent, since that is what the status claimed. A record that states
 * `delivery` keeps the value it states, a type that never carries one gets nothing more, and every other status,
 * `deprecated` included, is left as it is (its effective delivery is still `built`).
 */
export const statusToReviewLifecycle: RecordTransform = (source, frontmatter) => {
  const lines = source.split("\n");
  const first = frontmatter.line - 1;
  const last = first + frontmatter.text.split("\n").length;
  let inIntentset = false;
  let childIndent: number | null = null;
  let statusAt: number | null = null;
  let statusText = "";
  let type: string | null = null;
  let deliveryStated = false;
  let eol = "";
  let statusIndent = "";
  for (let i = first; i < last && i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (/^\S/.test(line)) {
      inIntentset = /^intentset:\s*(#.*)?$/.test(line);
      childIndent = null;
      continue;
    }
    if (!inIntentset || line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    childIndent ??= indent;
    if (indent !== childIndent) continue;
    const status = STATUS_LINE.exec(line);
    if (status !== null) {
      statusAt = i;
      statusIndent = " ".repeat(indent);
      eol = raw.endsWith("\r") ? "\r" : "";
      statusText = `${status[1]}${status[2]}approved${status[2]}${status[4]}`;
      continue;
    }
    type = TYPE_LINE.exec(line)?.[2] ?? type;
    if (DELIVERY_LINE.test(line)) deliveryStated = true;
  }
  if (statusAt === null) return source;
  lines[statusAt] = `${statusText}${eol}`;
  if (!deliveryStated && type !== null && (DELIVERY_TYPES as readonly string[]).includes(type)) {
    lines.splice(statusAt + 1, 0, `${statusIndent}delivery: built${eol}`);
  }
  return lines.join("\n");
};

/** Every move this command knows, oldest first; each step's `to` is the next step's `from`. */
export const MIGRATIONS: readonly MigrationStep[] = [
  { from: "0.1", to: "0.2", transforms: [] },
  { from: "0.2", to: "0.3", transforms: [statusToReviewLifecycle] },
];

/** The one target: the version this reader reads. */
export const MIGRATE_TO = SPEC_VERSION;

/** The versions a record can be moved from, oldest first. */
export const MIGRATE_FROM: readonly string[] = MIGRATIONS.map((step) => step.from);

export interface MigrateOptions {
  root?: string;
  to?: string;
  allowDirty?: boolean;
  carrier: CarrierName;
}

/** A message when the options cannot be run, before anything is read; null when they can. */
export function migrateUsageProblem(options: Pick<MigrateOptions, "to">): string | null {
  const from = MIGRATE_FROM.join(" or ");
  if (options.to === undefined) return `--to is required: the only target is ${MIGRATE_TO}, from ${from}`;
  if (options.to !== MIGRATE_TO) {
    return `--to ${options.to}: the only target is ${MIGRATE_TO}, which moves records written for ${from}`;
  }
  return null;
}

const SPEC_LINE = /^(\s+spec:\s*)(['"]?)(\d+\.\d+)\2(\s*(?:#.*)?)$/;
const PROFILE_LINE = /^(\s+profile:\s*)(['"]?)intentset\/([a-z0-9-]+)\/(\d+\.\d+)\2(\s*(?:#.*)?)$/;

/**
 * The record's text moved from `from` to `to`, or null when it declares another value. Only lines inside the
 * `intentset:` mapping of the frontmatter, and only `spec` and `profile`, are rewritten; line endings are kept.
 */
export function migrateText(source: string, frontmatter: FrontmatterSpan, from: string, to: string): string | null {
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

/** The `intentset.spec` a record declares, as the line holds it, or null when it declares none in the frontmatter. */
function declaredSpec(frontmatter: FrontmatterSpan): string | null {
  return /^\s+spec:\s*(['"]?)(\d+\.\d+)\1\s*(?:#.*)?$/m.exec(frontmatter.text)?.[2] ?? null;
}

/** The frontmatter of `source` that starts at `line`, read again after a step may have changed it. */
function frontmatterAt(source: string, line: number): FrontmatterSpan {
  const lines = source.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  let close = line - 1;
  while (close < lines.length && lines[close].trimEnd() !== "---") close++;
  return { line, text: lines.slice(line - 1, close).join("\n") };
}

/**
 * The record moved to `to` through every step from the version it declares, or null when it declares a version no
 * chain of steps leads from (the current one included).
 */
export function migrateRecord(source: string, frontmatter: FrontmatterSpan, to: string = MIGRATE_TO): string | null {
  let version = declaredSpec(frontmatter);
  let text = source;
  let span = frontmatter;
  if (version === to) return null;
  while (version !== to) {
    const step = MIGRATIONS.find((s) => s.from === version);
    if (step === undefined) return null;
    const moved = migrateText(text, span, step.from, step.to);
    if (moved === null) return null;
    text = moved;
    span = frontmatterAt(text, span.line);
    for (const transform of step.transforms) {
      text = transform(text, span);
      span = frontmatterAt(text, span.line);
    }
    version = step.to;
  }
  return text;
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
    const text = migrateRecord(input.source, input.frontmatter);
    if (text === null) {
      if (declaredSpec(input.frontmatter) === MIGRATE_TO) current++;
      else other++;
      continue;
    }
    if (text === input.source) continue;
    writeFileSync(join(root, input.path), text);
    moved++;
  }
  io.stdout(
    `intentset migrate: moved ${moved} record${moved === 1 ? "" : "s"} to ${MIGRATE_TO}` +
      `${current > 0 ? `; ${current} already ${MIGRATE_TO}` : ""}${other > 0 ? `; ${other} declare neither (left as they are)` : ""}.\n`,
  );
  return 0;
}
