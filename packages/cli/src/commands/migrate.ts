/**
 * `intentset migrate --to 0.3` (Core §1): moves the records the model reads to the specifications' current version,
 * `0.3`, from `0.2` or from `0.1`. A move is a chain of steps, one per version (`MIGRATIONS`): each step rewrites two
 * values in the record's frontmatter, `intentset.spec` and `intentset.profile`, which Core §4 requires to agree with
 * it, and then applies the per-record transforms that version lists, in order. The step to `0.3` has two:
 * `statusToReviewLifecycle` (ADR 0023), by which a `status` of `implemented` or `released` becomes `approved`, and a
 * record of a type that carries `delivery` and states none gets `delivery: built`, which is what the status claimed;
 * and `reviewToCoreField` (ADR 0025), by which a review under `extensions.intentset.org/review` moves to `review`, with
 * `hash: file-v1` where it named no hash, so no review changes what it pins. Every
 * other line is left byte for byte, and each rewritten line keeps its quoting, comment and line ending. It reads the same records every other command reads (the files the configured scope matches). A tree with uncommitted
 * changes to tracked files is refused unless `--allow-dirty` says otherwise, so the rewrite is a diff of its own that
 * git can undo. Other files (`.intentset/agents.md`, which carries an example record) are not records and are left to
 * their author.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DELIVERY_TYPES, parseYaml, SPEC_VERSION, sortDiagnostics } from "@intentset/core";
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

// Each key is read as YAML reads a plain block key: bare, single- or double-quoted, with optional spaces before the colon.
const STATUS_LINE = /^(\s+(['"]?)status\2\s*:\s*)(['"]?)(implemented|released)\3(\s*(?:#.*)?)$/;
const TYPE_LINE = /^\s+(['"]?)type\1\s*:\s*(['"]?)([a-z]+)\2\s*(?:#.*)?$/;
const DELIVERY_LINE = /^\s+(['"]?)delivery\1\s*:/;
/** A `delivery` key that states nothing (Core §7 reads null as not stated): its key and its trailing comment. */
const NULL_DELIVERY_LINE = /^(\s+(['"]?)delivery\2\s*:)(?:\s+(?:null|Null|NULL|~))?(\s*(?:#.*)?)$/;

/** One top-level line of a record's `intentset:` mapping: its index in the record's lines, and its text without `\r`. */
interface IntentsetLine {
  index: number;
  line: string;
  indent: number;
  eol: string;
}

/**
 * The lines directly under the frontmatter's `intentset:` key, at the indent of its first child, in order. A blank or
 * comment-only line belongs to no key, wherever its `#` stands (YAML allows a comment at column 0 inside a block
 * mapping), so it neither ends the mapping nor sets the child indent.
 */
function intentsetLines(lines: readonly string[], frontmatter: FrontmatterSpan): IntentsetLine[] {
  const first = frontmatter.line - 1;
  const last = first + frontmatter.text.split("\n").length;
  const found: IntentsetLine[] = [];
  let inIntentset = false;
  let childIndent: number | null = null;
  for (let i = first; i < last && i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (/^\S/.test(line)) {
      inIntentset = /^intentset:\s*(#.*)?$/.test(line);
      childIndent = null;
      continue;
    }
    if (!inIntentset) continue;
    const indent = line.length - line.trimStart().length;
    childIndent ??= indent;
    if (indent !== childIndent) continue;
    found.push({ index: i, line, indent, eol: raw.endsWith("\r") ? "\r" : "" });
  }
  return found;
}

/**
 * Core §7 at `0.3` (ADR 0023): `status` is the review lifecycle only. A record whose status is `implemented` or
 * `released` becomes `approved`; when its type carries `delivery` and it states none, `delivery: built` is written on
 * the line after its status, at the same indent, since that is what the status claimed. A `delivery` key holding
 * `null`, `~` or nothing states none (Core §7), so that line itself becomes `delivery: built`, keeping its comment.
 * A record that states `delivery` keeps the value it states, a type that never carries one gets nothing more, and
 * every other status, `deprecated` included, is left as it is (its effective delivery is still `built`).
 */
export const statusToReviewLifecycle: RecordTransform = (source, frontmatter) => {
  const lines = source.split("\n");
  let statusAt: number | null = null;
  let statusText = "";
  let type: string | null = null;
  let deliveryStated = false;
  let nullDeliveryAt: number | null = null;
  let nullDeliveryText = "";
  let eol = "";
  let statusIndent = "";
  for (const { index, line, indent, eol: lineEol } of intentsetLines(lines, frontmatter)) {
    const status = STATUS_LINE.exec(line);
    if (status !== null) {
      statusAt = index;
      statusIndent = " ".repeat(indent);
      eol = lineEol;
      statusText = `${status[1]}${status[3]}approved${status[3]}${status[5]}`;
      continue;
    }
    type = TYPE_LINE.exec(line)?.[3] ?? type;
    const nullDelivery = NULL_DELIVERY_LINE.exec(line);
    if (nullDelivery !== null) {
      nullDeliveryAt = index;
      nullDeliveryText = `${nullDelivery[1]} built${nullDelivery[3]}${lineEol}`;
    } else if (DELIVERY_LINE.test(line)) deliveryStated = true;
  }
  if (statusAt === null) return source;
  lines[statusAt] = `${statusText}${eol}`;
  if (deliveryStated || type === null || !(DELIVERY_TYPES as readonly string[]).includes(type)) {
    return lines.join("\n");
  }
  if (nullDeliveryAt !== null) lines[nullDeliveryAt] = nullDeliveryText;
  else {
    lines.splice(statusAt + 1, 0, `${statusIndent}delivery: built${eol}`);
  }
  return lines.join("\n");
};

const EXTENSIONS_LINE = /^\s+(['"]?)extensions\1\s*:\s*(?:#.*)?$/;
const REVIEW_EXTENSION_LINE = /^(\s+)(['"]?)intentset\.org\/review\2\s*:(.*)$/;
const HASH_LINE = /^\s+(['"]?)hash\1\s*:/;

/**
 * Core §9 at `0.3` (ADR 0025): a knowledge record's review is `review`, a core field, and no longer the
 * `intentset.org/review` extension. The extension's block moves out of `extensions` to `review` at the place
 * `extensions` stood, each of its lines dedented to sit one level under `intentset` and kept byte for byte otherwise,
 * comments included. Where the extension named no `hash`, `hash: file-v1` is written as its first line, since a review
 * with no `hash` pinned the whole file before `0.3` and pins content hashes after it, so no review changes what it pins.
 * `extensions` is removed when nothing else is left in it, and kept, with its other keys, otherwise. An extension
 * written in a form the rewrite does not read (a flow mapping, a value on the key's line) is left, and the command
 * names the record.
 */
export const reviewToCoreField: RecordTransform = (source, frontmatter) => {
  const lines = source.split("\n");
  const strip = (raw: string) => (raw.endsWith("\r") ? raw.slice(0, -1) : raw);
  const indentOf = (line: string) => line.length - line.trimStart().length;
  const content = (line: string) => line.trim() !== "" && !line.trim().startsWith("#");
  const top = intentsetLines(lines, frontmatter);
  const at = top.findIndex(({ line }) => EXTENSIONS_LINE.test(line));
  if (at === -1) return source;
  const { index: extensions, indent: childIndent } = top[at];
  const last = frontmatter.line - 1 + frontmatter.text.split("\n").length;
  /** The end (exclusive) of the block under the line at `from` deeper than `indent`, trailing blank and comment lines left out. */
  const blockEnd = (from: number, indent: number, limit: number) => {
    let end = from + 1;
    for (let i = from + 1; i < limit; i++) {
      const line = strip(lines[i]);
      if (!content(line)) continue;
      if (indentOf(line) <= indent) break;
      end = i + 1;
    }
    return end;
  };
  const extensionsEnd = blockEnd(extensions, childIndent, Math.min(last, lines.length));
  let key = -1;
  let keyIndent = 0;
  let deep: number | null = null;
  for (let i = extensions + 1; i < extensionsEnd; i++) {
    const line = strip(lines[i]);
    if (!content(line)) continue;
    deep ??= indentOf(line);
    if (indentOf(line) !== deep) continue;
    const match = REVIEW_EXTENSION_LINE.exec(line);
    if (match === null) continue;
    if (match[3].trim() !== "" && !match[3].trim().startsWith("#")) return source;
    key = i;
    keyIndent = indentOf(line);
    break;
  }
  if (key === -1) return source;
  const reviewEnd = blockEnd(key, keyIndent, extensionsEnd);
  const shift = keyIndent - childIndent;
  const eol = lines[key].endsWith("\r") ? "\r" : "";
  const dedent = (raw: string) => {
    const line = strip(raw);
    const lead = Math.min(shift, indentOf(line));
    return `${line.slice(lead)}${raw.endsWith("\r") ? "\r" : ""}`;
  };
  const head = REVIEW_EXTENSION_LINE.exec(strip(lines[key])) as RegExpExecArray;
  const moved = [`${" ".repeat(childIndent)}review:${head[3]}${eol}`];
  const children = lines.slice(key + 1, reviewEnd);
  const firstChild = children.map(strip).find(content);
  if (firstChild !== undefined) {
    const childDepth = indentOf(firstChild);
    const named = children
      .map(strip)
      .some((line) => content(line) && indentOf(line) === childDepth && HASH_LINE.test(line));
    if (!named) moved.push(`${" ".repeat(childDepth - shift)}hash: file-v1${eol}`);
  }
  moved.push(...children.map(dedent));
  lines.splice(key, reviewEnd - key);
  const left = lines.slice(extensions + 1, extensionsEnd - (reviewEnd - key)).some((raw) => content(strip(raw)));
  if (left) lines.splice(extensions, 0, ...moved);
  else lines.splice(extensions, extensionsEnd - (reviewEnd - key) - extensions, ...moved);
  return lines.join("\n");
};

/** The `intentset` mapping of a frontmatter read as YAML, or a message when it does not read. */
function intentsetMapping(frontmatter: FrontmatterSpan): Record<string, unknown> | string {
  const parsed = parseYaml(frontmatter.text);
  if (parsed.value === null) return parsed.error.message;
  const intentset = parsed.value.intentset;
  if (intentset === null || typeof intentset !== "object" || Array.isArray(intentset)) return {};
  return intentset as Record<string, unknown>;
}

const REMOVED_STATUSES: readonly unknown[] = ["implemented", "released"];

/**
 * Why a record the line rewrite moved did not move in full, read by comparing the original and the rewritten
 * frontmatter as YAML; null when it did. The transform rewrites every line it can read; one it cannot (a flow mapping,
 * a block scalar, an escaped value) is left, and the command says so rather than count the record as moved: a
 * rewrite that no longer reads as YAML (a duplicate key), a status `0.3` does not list, or a status that claimed an
 * implementation on a type that carries `delivery` and now leaves it unstated, which would change what it means.
 */
export function migrationProblem(before: FrontmatterSpan, after: FrontmatterSpan): string | null {
  const moved = intentsetMapping(after);
  if (typeof moved === "string") return `no longer reads as YAML (${moved})`;
  if (REMOVED_STATUSES.includes(moved.status)) return "still declares a status 0.3 does not list";
  const original = intentsetMapping(before);
  const review = reviewProblem(typeof original === "string" ? {} : original, moved);
  if (review !== null) return review;
  if (typeof original === "string" || !REMOVED_STATUSES.includes(original.status)) return null;
  const type = moved.type;
  if (typeof type !== "string" || !(DELIVERY_TYPES as readonly string[]).includes(type)) return null;
  if (moved.delivery === undefined || moved.delivery === null) return "lost the delivery its status claimed";
  return null;
}

/**
 * ADR 0025: why a review did not move in full to `review` with the meaning it had, or null when it did (or there was
 * none). Before `0.3` a review with no `hash` pinned the whole file; after, `review` with no `hash` pins content.
 */
function reviewProblem(original: Record<string, unknown>, moved: Record<string, unknown>): string | null {
  const ext = (mapping: Record<string, unknown>) => {
    const extensions = mapping.extensions;
    if (extensions === null || typeof extensions !== "object" || Array.isArray(extensions)) return undefined;
    return (extensions as Record<string, unknown>)["intentset.org/review"];
  };
  if (ext(moved) !== undefined) return "still carries the intentset.org/review extension 0.3 does not read";
  const before = ext(original);
  if (before === undefined) return null;
  // Before, a null `hash` was a kind no pin matched; after, core reads a null as absent, which is content-v1.
  const kind = (review: unknown, absent: string, nullKind: string) => {
    if (review === null || typeof review !== "object" || Array.isArray(review)) return null;
    const hash = (review as Record<string, unknown>).hash;
    return hash === undefined ? absent : hash === null ? nullKind : JSON.stringify(hash);
  };
  const wasKind = kind(before, JSON.stringify("file-v1"), "null");
  const nowKind = kind(moved.review, JSON.stringify("content-v1"), JSON.stringify("content-v1"));
  if (wasKind !== nowKind) return "moved its review to review with another pin kind";
  return null;
}

/** Every move this command knows, oldest first; each step's `to` is the next step's `from`. */
export const MIGRATIONS: readonly MigrationStep[] = [
  { from: "0.1", to: "0.2", transforms: [] },
  { from: "0.2", to: "0.3", transforms: [statusToReviewLifecycle, reviewToCoreField] },
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
  let specSeen = false;
  const edits = new Map<number, string>();
  for (const { index, line, eol } of intentsetLines(lines, frontmatter)) {
    const spec = SPEC_LINE.exec(line);
    if (spec !== null) {
      if (spec[3] !== from) return null;
      specSeen = true;
      edits.set(index, `${spec[1]}${spec[2]}${to}${spec[2]}${spec[4]}${eol}`);
      continue;
    }
    const profile = PROFILE_LINE.exec(line);
    if (profile !== null && profile[4] === from) {
      edits.set(index, `${profile[1]}${profile[2]}intentset/${profile[3]}/${to}${profile[2]}${profile[5]}${eol}`);
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
  const left: { path: string; problem: string }[] = [];
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
    const problem = migrationProblem(input.frontmatter, frontmatterAt(text, input.frontmatter.line));
    if (problem !== null) left.push({ path: input.path, problem });
    else moved++;
  }
  io.stdout(
    `intentset migrate: moved ${moved} record${moved === 1 ? "" : "s"} to ${MIGRATE_TO}` +
      `${current > 0 ? `; ${current} already ${MIGRATE_TO}` : ""}${other > 0 ? `; ${other} declare neither (left as they are)` : ""}.\n`,
  );
  if (left.length === 0) return 0;
  io.stderr(
    `intentset migrate: ${left.length} record${left.length === 1 ? "" : "s"} moved to ${MIGRATE_TO} could not be rewritten in full, ` +
      "in a form the rewrite could not read; give each one key per name, a status of approved, delivery: built " +
      "where its type carries delivery and it states none, and its review under review (with hash: file-v1 where " +
      "the extension named none):\n" +
      [...left]
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map(({ path, problem }) => `  ${path}: ${problem}\n`)
        .join(""),
  );
  return 1;
}
