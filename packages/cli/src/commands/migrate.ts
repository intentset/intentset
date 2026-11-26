/**
 * `intentset migrate --to 0.3` (Core §1): moves the records the model reads to the specifications' current version,
 * `0.3`, from `0.2` or from `0.1`. A move is a chain of steps, one per version (`MIGRATIONS`): each step rewrites two
 * values in the record's frontmatter, `intentset.spec` and `intentset.profile`, which Core §4 requires to agree with
 * it, and then applies the per-record transforms that version lists, in order. The step to `0.3` has two:
 * `statusToReviewLifecycle` (ADR 0023), by which a `status` of `implemented` or `released` becomes `approved`, and a
 * record of a type that carries `delivery` and states none gets `delivery: built`, which is what the status claimed;
 * and `reviewToCoreField` (ADR 0025), by which a review under `extensions.intentset.org/review` moves to `review`, with
 * `hash: file-v1` where it named no hash, so no review changes what it pins. Then, over the whole tree, `repinReviews`
 * re-pins each knowledge review pin that matched its source before the move (Core §1, publication §3): the move
 * rewrites `spec` and `profile`, which both pin kinds cover, so a pin equal to its source's hash as the source was
 * written becomes the same kind of hash of the source as moved, and a pin that did not match is left as written. A
 * knowledge record's `self` (ADR 0027), its own content hash at review, is re-pinned the same way when it matched the
 * record as written and the record's own version read `self` (`0.3` or later); a review extension's `self` and `gates`,
 * which no earlier version read, are left out of `review` and named, so a review current before the move is current
 * after it. `gates` covers neither `spec` nor `profile`, so no move changes it. Every
 * other line is left byte for byte, and each rewritten line keeps its quoting, comment and line ending. It reads the same records every other command reads (the files the configured scope matches). A tree with uncommitted
 * changes to tracked files is refused unless `--allow-dirty` says otherwise, so the rewrite is a diff of its own that
 * git can undo. Other files (`.intentset/agents.md`, which carries an example record) are not records and are left to
 * their author.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  closingFenceIndex,
  compareStrings,
  contentHashOf,
  DELIVERY_TYPES,
  ownContentHashOf,
  ID_PATTERN,
  parseYaml,
  SPEC_VERSION,
  sha256Hex,
  sortDiagnostics,
} from "@intentset/core";
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
const UNREAD_BEFORE_0_3_LINE = /^\s+(['"]?)(?:self|gates)\1\s*:/;
const SEQUENCE_ENTRY_LINE = /^\s*-(?:\s|$)/;

/** The review keys `review` reads from `0.3` (ADR 0027) that a review extension before it held with no meaning. */
const UNREAD_BEFORE_0_3: readonly string[] = ["gates", "self"];

/**
 * Core §9 at `0.3` (ADR 0025): a knowledge record's review is `review`, a core field, and no longer the
 * `intentset.org/review` extension. The extension's block moves out of `extensions` to `review` at the place
 * `extensions` stood, each of its lines dedented to sit one level under `intentset` and kept byte for byte otherwise,
 * comments included. Where the extension named no `hash`, `hash: file-v1` is written as its first line, since a review
 * with no `hash` pinned the whole file before `0.3` and pins content hashes after it, so no review changes what it pins.
 * `extensions` is removed when nothing else is left in it, and kept, with its other keys, otherwise. Only a knowledge
 * record's extension moves: on any other type `review` is CORE001 as the extension is, so the extension is left where
 * it is and the command names the record. An extension written in a form the rewrite does not read (a flow mapping, a
 * value on the key's line) is left too, and the command names the record. A `self` or `gates` in the extension, which
 * no reader before `0.3` read, is left out of `review`, with the lines nested under it, since `0.3` reads each as a
 * review pin that no earlier tool could have computed, a block sequence written at the key's own indent included; the
 * command names the record and the keys it left out.
 */
export const reviewToCoreField: RecordTransform = (source, frontmatter) => {
  const lines = source.split("\n");
  const strip = (raw: string) => (raw.endsWith("\r") ? raw.slice(0, -1) : raw);
  const indentOf = (line: string) => line.length - line.trimStart().length;
  const content = (line: string) => line.trim() !== "" && !line.trim().startsWith("#");
  const top = intentsetLines(lines, frontmatter);
  let type: string | null = null;
  for (const { line } of top) type = TYPE_LINE.exec(line)?.[3] ?? type;
  if (type !== "knowledge") return source;
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
  const block = lines.slice(key + 1, reviewEnd);
  const firstChild = block.map(strip).find(content);
  const childDepth = firstChild === undefined ? 0 : indentOf(firstChild);
  const children: string[] = [];
  let unread = false;
  for (const raw of block) {
    const line = strip(raw);
    if (content(line) && indentOf(line) === childDepth && !SEQUENCE_ENTRY_LINE.test(line)) {
      unread = UNREAD_BEFORE_0_3_LINE.test(line);
    }
    if (unread && content(line)) continue;
    children.push(raw);
  }
  if (firstChild !== undefined) {
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

const REVIEW_KEYS: readonly string[] = ["sources", "hash", "snapshot"];

/**
 * ADR 0025: why a review did not move in full to `review` with the meaning it had, or null when it did (or there was
 * none). Before `0.3` the extension was read on knowledge alone, by its `sources`, `hash` and `snapshot`, and anything
 * else in it was ignored; after, `review` also reads `self` and `gates` (ADR 0027), which the move leaves out
 * (`unreadReviewKeys` names them), `review` is CORE001 on any other type, and core drops a whole review that holds a key,
 * pin key or value it does not read (Core §9), so the knowledge would read as unreviewed. A review that would is named
 * rather than counted as moved. Before `0.3` a review with no `hash` pinned the whole file; after, `review` with no
 * `hash` pins content, so the pin kind is compared too.
 */
function reviewProblem(original: Record<string, unknown>, moved: Record<string, unknown>): string | null {
  const ext = (mapping: Record<string, unknown>) => {
    const extensions = mapping.extensions;
    if (extensions === null || typeof extensions !== "object" || Array.isArray(extensions)) return undefined;
    return (extensions as Record<string, unknown>)["intentset.org/review"];
  };
  if (ext(moved) !== undefined) {
    if (moved.type !== "knowledge") {
      const type = typeof moved.type === "string" ? `a ${moved.type}` : "a record of no type";
      return `carries the intentset.org/review extension on ${type}, which 0.3 rejects (only knowledge is reviewed)`;
    }
    return "still carries the intentset.org/review extension 0.3 does not read";
  }
  const before = ext(original);
  if (before === undefined) return null;
  const shape = reviewShapeProblem(moved.review);
  if (shape !== null) return `its review holds ${shape}, which 0.3 does not read`;
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

/** What in a moved `review` core's reader rejects (Core §9), or null when it reads the whole of it. */
function reviewShapeProblem(review: unknown): string | null {
  const isMapping = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const filled = (value: unknown) => typeof value === "string" && value !== "";
  if (!isMapping(review)) return "no mapping";
  const keys = Object.keys(review).sort(compareStrings);
  const unknown = keys.find((key) => !REVIEW_KEYS.includes(key));
  if (unknown !== undefined) return `the key ${unknown}`;
  if (review.sources === undefined || review.sources === null) return "no sources";
  if (!isMapping(review.sources)) return "sources that are not a mapping";
  for (const key of Object.keys(review.sources).sort(compareStrings)) {
    if (!ID_PATTERN.test(key)) return `the pin key ${key}, which is not an ID`;
    if (!filled(review.sources[key])) return `a pin for ${key} that is not a non-empty string`;
  }
  for (const key of ["hash", "snapshot"]) {
    const value = review[key];
    if (value !== undefined && value !== null && !filled(value)) return `a ${key} that is not a non-empty string`;
  }
  return null;
}

/**
 * ADR 0027: the keys of a knowledge record's review extension that no reader before `0.3` read and that `0.3` reads as
 * review pins (`self`, `gates`), which the move left out of `review`, sorted; empty when it left out none or did not
 * move the review.
 */
export function unreadReviewKeys(before: FrontmatterSpan, after: FrontmatterSpan): string[] {
  const original = intentsetMapping(before);
  const moved = intentsetMapping(after);
  if (typeof original === "string" || typeof moved === "string") return [];
  const isMapping = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const extensions = original.extensions;
  const review = isMapping(extensions) ? extensions["intentset.org/review"] : undefined;
  if (!isMapping(review) || !isMapping(moved.review)) return [];
  const now = moved.review;
  return UNREAD_BEFORE_0_3.filter((key) => key in review && !(key in now));
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

const UNREAD_SELF_VERSIONS: readonly string[] = ["0.1", "0.2"];

/** Whether a record that declares `spec` read a review's `self` (ADR 0027): from `0.3` on. */
function readsSelf(spec: string | null): boolean {
  return spec !== null && !UNREAD_SELF_VERSIONS.includes(spec);
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

/** One record in scope as `repinReviews` reads it: its path, where its frontmatter starts, and its text before and after the move. */
export interface RepinRecord {
  path: string;
  line: number;
  before: string;
  after: string;
}

export interface RepinResult {
  /** The text of each record whose pins were re-pinned, by path, in place of its `after`. */
  texts: Map<string, string>;
  /** Pins rewritten: each matched its source as written and now holds the same kind of hash of the source as moved. */
  repinned: number;
  /** Pins of a source the move changed that did not match it before the move, left as written: a stale review stays stale. */
  stale: number;
  /** A record holding a matched pin the line rewrite could not reach (a key written as an escape), and why. */
  problems: { path: string; problem: string }[];
}

type PinKind = "content-v1" | "file-v1";

/**
 * A record's hash of one pin kind (publication §3): `file-v1` is the SHA-256 of the whole file, its `sourceHash`, and
 * `content-v1` the content hash of its parsed frontmatter and its body, as core computes `contentHash`, and `own` that
 * hash without `ending`, as core computes `ownContentHash` (ADR 0027). Null when the
 * frontmatter does not read, since no pin can match a content hash that cannot be taken.
 */
export function recordHash(source: string, line: number, kind: PinKind | "own"): string | null {
  if (kind === "file-v1") return sha256Hex(source);
  const parsed = parseYaml(frontmatterAt(source, line).text);
  if (parsed.value === null) return null;
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const lines = text.split("\n");
  const close = closingFenceIndex(lines);
  const body = close === -1 ? text : lines.slice(close + 1).join("\n");
  return kind === "own" ? ownContentHashOf(parsed.value, body) : contentHashOf(parsed.value, body);
}

const REVIEW_LINE = /^\s+(['"]?)review\1\s*:\s*(?:#.*)?$/;
const SOURCES_LINE = /^\s+(['"]?)sources\1\s*:\s*(?:#.*)?$/;
const SELF = "@self";
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * The record's text with the pin for `id` under `review.sources` rewritten from `from` to `to`, keeping its quoting,
 * comment and line ending; null when no line holds that pin in block form.
 */
function rewritePin(source: string, line: number, id: string, from: string, to: string): string | null {
  const lines = source.split("\n");
  const strip = (raw: string) => (raw.endsWith("\r") ? raw.slice(0, -1) : raw);
  const indentOf = (text: string) => text.length - text.trimStart().length;
  const content = (text: string) => text.trim() !== "" && !text.trim().startsWith("#");
  const span = frontmatterAt(source, line);
  const last = Math.min(span.line - 1 + span.text.split("\n").length, lines.length);
  const blockEnd = (at: number, indent: number) => {
    let end = at + 1;
    for (let i = at + 1; i < last; i++) {
      const text = strip(lines[i]);
      if (!content(text)) continue;
      if (indentOf(text) <= indent) break;
      end = i + 1;
    }
    return end;
  };
  const review = intentsetLines(lines, span).find(({ line: text }) => REVIEW_LINE.test(text));
  if (review === undefined) return null;
  const reviewEnd = blockEnd(review.index, review.indent);
  let sources = -1;
  let childIndent: number | null = null;
  for (let i = review.index + 1; i < reviewEnd; i++) {
    const text = strip(lines[i]);
    if (!content(text)) continue;
    childIndent ??= indentOf(text);
    if (indentOf(text) === childIndent && SOURCES_LINE.test(text)) sources = i;
  }
  if (id === SELF) {
    // `review.self`: one line directly under `review`, at its child indent.
    const self = new RegExp(`^(\\s+)(['"]?)self\\2(\\s*:\\s*)(['"]?)${escapeRegExp(from)}\\4(\\s*(?:#.*)?)$`);
    for (let i = review.index + 1; i < reviewEnd; i++) {
      const text = strip(lines[i]);
      const match = self.exec(text);
      if (match === null || indentOf(text) !== childIndent) continue;
      lines[i] =
        `${match[1]}${match[2]}self${match[2]}${match[3]}${match[4]}${to}${match[4]}${match[5]}${lines[i].endsWith("\r") ? "\r" : ""}`;
      return lines.join("\n");
    }
    return null;
  }
  if (sources === -1) return null;
  const pin = new RegExp(
    `^(\\s+)(['"]?)${escapeRegExp(id)}\\2(\\s*:\\s*)(['"]?)${escapeRegExp(from)}\\4(\\s*(?:#.*)?)$`,
  );
  for (let i = sources + 1; i < blockEnd(sources, indentOf(strip(lines[sources]))); i++) {
    const match = pin.exec(strip(lines[i]));
    if (match === null) continue;
    lines[i] =
      `${match[1]}${match[2]}${id}${match[2]}${match[3]}${match[4]}${to}${match[4]}${match[5]}${lines[i].endsWith("\r") ? "\r" : ""}`;
    return lines.join("\n");
  }
  return null;
}

/** The pin kind a review at the target reads (Core §9): an absent or null `hash` is `content-v1`; null for a kind no pin matches. */
function currentPinKind(hash: unknown): PinKind | null {
  if (hash === undefined || hash === null || hash === "content-v1") return "content-v1";
  return hash === "file-v1" ? "file-v1" : null;
}

/**
 * The pin kind the review of a record the run moves had at the version it declared, read from the record as written:
 * before `0.3` the `intentset.org/review` extension with no `hash` pinned the whole file (`file-v1` after the move) and
 * `hash: content-v1` pinned content; any other `hash`, `file-v1` and null included, was a kind that reader did not know,
 * so no pin matched and the review stays stale. Null too when the record carried no such extension.
 */
function declaredPinKind(before: string, line: number): PinKind | null {
  const meta = intentsetMapping(frontmatterAt(before, line));
  if (typeof meta === "string") return null;
  const extensions = meta.extensions;
  if (extensions === null || typeof extensions !== "object" || Array.isArray(extensions)) return null;
  const review = (extensions as Record<string, unknown>)["intentset.org/review"];
  if (review === null || typeof review !== "object" || Array.isArray(review)) return null;
  const hash = (review as Record<string, unknown>).hash;
  if (hash === undefined) return "file-v1";
  return hash === "content-v1" ? "content-v1" : null;
}

/**
 * How `repinReviews` treats a knowledge record's own pins, read from its text before the move: whether the move
 * rewrites its pins at all (it moves the record, or the record is already at the target), the source pin kind it reads
 * them by (null: none matches, so none is re-pinned), and whether its `self` can be re-pinned (only when the move
 * changes the record itself, and its declared version read `self`). `intentset review` replays exactly this, so a hand
 * edit migrate would never write is listed.
 */
export function repinPlan(before: string, line: number): { rewrites: boolean; kind: PinKind | null; self: boolean } {
  const span = frontmatterAt(before, line);
  const atTarget = declaredSpec(span) === MIGRATE_TO;
  const moved = atTarget ? null : migrateRecord(before, span);
  const changes = moved !== null && moved !== before;
  if (!atTarget && !changes) return { rewrites: false, kind: null, self: false };
  if (!atTarget) return { rewrites: true, kind: declaredPinKind(before, line), self: readsSelf(declaredSpec(span)) };
  const meta = intentsetMapping(span);
  const review = typeof meta === "string" ? undefined : meta.review;
  const hash =
    review !== null && typeof review === "object" && !Array.isArray(review)
      ? (review as Record<string, unknown>).hash
      : undefined;
  return { rewrites: true, kind: currentPinKind(hash), self: false };
}

/**
 * Core §1 and publication §3 (decided 2026-11-25): the move re-pins each knowledge review pin that matched before it.
 * A pin, of the review's kind as the knowledge record's own declared version read it, that equals its source's hash
 * as the source was written, at the version it declared, becomes the same kind of hash of the source as moved; a pin
 * that did not match, names a record outside the tree or is of a kind that version did not know is left as written, so
 * a stale review stays stale and no review is created. Every record in scope counts as a source; the pins of a knowledge
 * record are rewritten when the run moves it or it is already at the target, since one at the target can pin a source
 * the run moves, and never when it declares neither. A `file-v1` pin of a knowledge record whose own pins
 * were re-pinned follows it, so the rewrite runs until nothing changes.
 */
export function repinReviews(records: readonly RepinRecord[]): RepinResult {
  const metas = records.map((record) => intentsetMapping(frontmatterAt(record.after, record.line)));
  const byId = new Map<string, number>();
  const repeated = new Set<string>();
  metas.forEach((meta, i) => {
    if (typeof meta === "string" || typeof meta.id !== "string") return;
    if (byId.has(meta.id)) repeated.add(meta.id);
    byId.set(meta.id, i);
  });
  for (const id of repeated) byId.delete(id);
  const isMapping = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const pins: {
    record: number;
    source: number;
    id: string;
    kind: PinKind | "own";
    original: string;
    value: string;
  }[] = [];
  let stale = 0;
  metas.forEach((meta, i) => {
    if (typeof meta === "string" || meta.type !== "knowledge" || !isMapping(meta.review)) return;
    const { sources } = meta.review;
    if (!isMapping(sources)) return;
    const record = records[i];
    // Only a record the run moves, or one already at the target, has its pins rewritten; one that declares neither is
    // left byte for byte, as the command reports it.
    const atTarget = declaredSpec(frontmatterAt(record.before, record.line)) === MIGRATE_TO;
    if (!atTarget && record.before === record.after) return;
    const kind = atTarget ? currentPinKind(meta.review.hash) : declaredPinKind(record.before, record.line);
    // ADR 0027: `self` is the record's own content hash whatever the kind; it moves only when the record itself does,
    // and only from a version that read it.
    const self = meta.review.self;
    const ownSpec = declaredSpec(frontmatterAt(record.before, record.line));
    if (typeof self === "string" && record.before !== record.after && readsSelf(ownSpec)) {
      if (self === recordHash(record.before, record.line, "own")) {
        pins.push({ record: i, source: i, id: SELF, kind: "own", original: self, value: self });
      } else stale++;
    }
    for (const id of Object.keys(sources).sort(compareStrings)) {
      const source = byId.get(id);
      if (source === undefined || records[source].before === records[source].after) continue;
      const pin = sources[id];
      const was = kind === null ? null : recordHash(records[source].before, records[source].line, kind);
      if (kind !== null && typeof pin === "string" && was !== null && pin === was) {
        pins.push({ record: i, source, id, kind, original: pin, value: pin });
      } else stale++;
    }
  });
  const current = records.map((record) => record.after);
  const problems: { record: number; problem: string }[] = [];
  const left = new Set<(typeof pins)[number]>();
  for (let round = 0; round <= records.length; round++) {
    let moved = false;
    for (const pin of pins) {
      if (left.has(pin)) continue;
      const now = recordHash(current[pin.source], records[pin.source].line, pin.kind);
      if (now === pin.value) continue;
      const text =
        now === null ? null : rewritePin(current[pin.record], records[pin.record].line, pin.id, pin.value, now);
      if (now === null || text === null) {
        left.add(pin);
        problems.push({
          record: pin.record,
          problem:
            now === null
              ? `its review pin for ${pin.id === SELF ? "its own text (self)" : pin.id} matched before the move, and ${pin.id === SELF ? "the record" : pin.id} no longer reads as YAML, so it was left as written`
              : `its review pin for ${pin.id === SELF ? "its own text (self)" : pin.id} matched before the move and is written in a form the rewrite does not read, so it was left as written`,
        });
        continue;
      }
      current[pin.record] = text;
      pin.value = now;
      moved = true;
    }
    if (!moved) break;
  }
  const texts = new Map<string, string>();
  records.forEach((record, i) => {
    if (current[i] !== record.after) texts.set(record.path, current[i]);
  });
  return {
    texts,
    repinned: pins.filter((pin) => pin.value !== pin.original).length,
    stale,
    problems: problems
      .map(({ record, problem }) => ({ path: records[record].path, problem }))
      .sort((a, b) => compareStrings(a.path, b.path) || compareStrings(a.problem, b.problem)),
  };
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
  const unread: { path: string; keys: string[] }[] = [];
  // Every record is moved in memory first, so the review pins can be re-pinned against the whole tree before anything is written.
  const records: RepinRecord[] = [];
  for (const input of repo.inputs) {
    if (input.frontmatter === null) continue;
    const text = migrateRecord(input.source, input.frontmatter);
    records.push({ path: input.path, line: input.frontmatter.line, before: input.source, after: text ?? input.source });
    if (text === null) {
      if (declaredSpec(input.frontmatter) === MIGRATE_TO) current++;
      else other++;
      continue;
    }
    if (text === input.source) continue;
    const after = frontmatterAt(text, input.frontmatter.line);
    const problem = migrationProblem(input.frontmatter, after);
    if (problem !== null) left.push({ path: input.path, problem });
    else moved++;
    const keys = unreadReviewKeys(input.frontmatter, after);
    if (keys.length > 0) unread.push({ path: input.path, keys });
  }
  const repin = repinReviews(records);
  for (const record of records) {
    const text = repin.texts.get(record.path) ?? record.after;
    if (text !== record.before) writeFileSync(join(root, record.path), text);
  }
  const pins = (n: number) => `${n} review pin${n === 1 ? "" : "s"}`;
  const repinned =
    repin.repinned > 0 || repin.stale > 0
      ? `; re-pinned ${pins(repin.repinned)} that matched before the move` +
        `${repin.stale > 0 ? `, and left ${pins(repin.stale)} that did not as written` : ""}`
      : "";
  io.stdout(
    `intentset migrate: moved ${moved} record${moved === 1 ? "" : "s"} to ${MIGRATE_TO}` +
      `${current > 0 ? `; ${current} already ${MIGRATE_TO}` : ""}${other > 0 ? `; ${other} declare neither (left as they are)` : ""}${repinned}.\n`,
  );
  if (unread.length > 0) {
    io.stderr(
      `intentset migrate: left out of review ${unread.length === 1 && unread[0].keys.length === 1 ? "a key" : "keys"} that no version before ${MIGRATE_TO} read; ` +
        `${MIGRATE_TO} reads self and gates as review pins, which no earlier tool could have written, so the review means what it did:\n` +
        [...unread]
          .sort((a, b) => compareStrings(a.path, b.path))
          .map(({ path, keys }) => `  ${path}: ${keys.join(", ")}\n`)
          .join(""),
    );
  }
  if (left.length === 0 && repin.problems.length === 0) return 0;
  if (left.length > 0) {
    io.stderr(
      `intentset migrate: ${left.length} record${left.length === 1 ? "" : "s"} moved to ${MIGRATE_TO} could not be rewritten in full; give each one key per name, a status of approved, delivery: built ` +
        "where its type carries delivery and it states none, and, on knowledge alone, its review under review (with " +
        "hash: file-v1 where the extension named none) holding only sources keyed by ID, hash and snapshot, each a " +
        "non-empty string:\n" +
        [...left]
          .sort((a, b) => compareStrings(a.path, b.path))
          .map(({ path, problem }) => `  ${path}: ${problem}\n`)
          .join(""),
    );
  }
  if (repin.problems.length > 0) {
    io.stderr(
      `intentset migrate: ${pins(repin.problems.length)} that matched before the move could not be re-pinned; write each in block form under review.sources, or have the knowledge reviewed again:\n` +
        repin.problems.map(({ path, problem }) => `  ${path}: ${problem}\n`).join(""),
    );
  }
  return 1;
}
