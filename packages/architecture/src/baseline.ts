/**
 * A baseline of known violations for adoption by declared scope (VSA §9):
 * baseline the existing violations, block new ones, retire the baseline
 * progressively. In migration mode a diagnostic the baseline knows becomes a
 * warning marked "(baselined)" and is counted apart; in strict mode the
 * baseline is ignored, so the two modes are always distinguishable.
 *
 * An entry fingerprints what a finding is about, not how its message reads
 * (0.9, closing #20 and #88): the code, path, artifact and field, then, for a
 * finding about one import, how it imports, its target and one name it takes,
 * so a finding about an import is held one name at a time; for another finding
 * with edges, its file and slice edges; for one with neither edges nor a
 * field, its message, which is all that tells it from another. Nothing hashed
 * carries a line number, so moving an import does not unbaseline it, while a
 * new file, a new target, a new name or a larger cycle is a new entry and
 * stays an error. A message that names unrelated state, such as AMP007's list
 * of declared areas, no longer moves a fingerprint. Matching is one entry per
 * key: a baseline of one violation does not absorb a second copy of it. An
 * entry also keeps the name and the message it was written from, so a reader
 * of the file, or of a diff of it, sees what each entry holds.
 *
 * An entry written before 0.9 fingerprints the whole message. It still
 * matches, by that fingerprint, and goes when the baseline is written again,
 * which writes the current form; a review reads that as a rewrite, not as
 * growth.
 *
 * A baseline only shrinks. An entry that matches nothing in migration mode is
 * VSA014, an error: the violation it held is gone, and the entry would let it
 * come back unnoticed. `compareBaselines` says what a change added to a
 * baseline and what it retired, for `intentset review` (VSA §9).
 */
import { canonicalJson, type Diagnostic, sha256Hex } from "@intentset/core";
import { annotate } from "./exceptions.ts";
import type { SubjectEdge, Taken } from "./finding.ts";
import { compareStrings } from "./patterns.ts";

export type Mode = "migration" | "strict";

export interface BaselineEntry {
  code: string;
  path: string | null;
  artifact?: string;
  /** For an entry about an import, the one name it holds (`type X` for a type-only name, `*` for every name). */
  name?: string;
  /** The diagnostic's message without notes. Written since 0.9; an older file's entries have none. */
  message?: string;
  /** `v2-` and a hash of what the finding is about since 0.9; a bare hash of the whole message before. */
  fingerprint: string;
}

/** What a diagnostic is about beyond its code and place, from the finding it came from. */
export interface BaselineSubject {
  edges: readonly SubjectEdge[];
  taken?: Taken;
}

/** The prefix of a fingerprint written since 0.9. */
export const FINGERPRINT_V2 = "v2-";

/** A stale entry: reported, never recorded in a baseline. */
export const STALE_ENTRY_CODE = "VSA014";

const NOTES =
  / \((?:baselined|excepted by [^()]*|exception [^()]* expired [^()]*|not in the baseline: [^()]*)\)(?=\.?$)/;

/** The message without the notes exceptions and baselines add. */
export function plainMessage(message: string): string {
  let out = message;
  for (let previous = ""; previous !== out; ) {
    previous = out;
    out = out.replace(NOTES, "");
  }
  return out;
}

/** The fingerprint before 0.9: the whole message. Kept so a baseline written then still matches. */
export function fingerprint(diagnostic: Diagnostic): string {
  return sha256Hex(
    canonicalJson({
      code: diagnostic.code,
      path: diagnostic.path,
      artifact: diagnostic.artifact,
      field: diagnostic.field ?? null,
      message: plainMessage(diagnostic.message),
    }),
  );
}

function isBaselined(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === "warning" && / \(baselined\)\.?$/.test(diagnostic.message);
}

/**
 * The keys a diagnostic is held by: one for each name a finding about an import takes, else one. `subject` is what
 * the finding is about; a diagnostic with none, such as a configuration error, is held by its field or its message.
 */
export function baselineKeys(
  diagnostic: Diagnostic,
  subject?: BaselineSubject,
): { name: string | null; fingerprint: string }[] {
  const place = {
    code: diagnostic.code,
    path: diagnostic.path,
    artifact: diagnostic.artifact,
    field: diagnostic.field ?? null,
  };
  const key = (identity: Record<string, unknown>, name: string | null) => ({
    name,
    fingerprint: `${FINGERPRINT_V2}${sha256Hex(canonicalJson({ ...place, ...identity, name }))}`,
  });
  if (subject?.taken !== undefined) {
    const { kind, to, names } = subject.taken;
    const each = names.length === 0 ? [null] : [...new Set(names)].sort(compareStrings);
    return each.map((name) => key({ kind, to }, name));
  }
  if (subject !== undefined && subject.edges.length > 0) {
    const edges = [...new Set(subject.edges.map((edge) => `${edge.from} -> ${edge.to}`))].sort(compareStrings);
    return [key({ edges }, null)];
  }
  if (diagnostic.field !== undefined) return [key({}, null)];
  return [key({ message: plainMessage(diagnostic.message) }, null)];
}

/**
 * Record every error, and every diagnostic already baselined, as the baseline to adopt: one entry per key. Sorted.
 * A stale entry's VSA014 is not recorded: writing the baseline again is how a stale entry is retired.
 */
export function writeBaseline(
  diagnostics: readonly Diagnostic[],
  subjectOf: (diagnostic: Diagnostic) => BaselineSubject | undefined = () => undefined,
): BaselineEntry[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "error" || isBaselined(diagnostic))
    .filter((diagnostic) => diagnostic.code !== STALE_ENTRY_CODE)
    .flatMap((diagnostic) =>
      baselineKeys(diagnostic, subjectOf(diagnostic)).map((key) => ({
        code: diagnostic.code,
        path: diagnostic.path,
        ...(diagnostic.artifact !== null ? { artifact: diagnostic.artifact } : {}),
        ...(key.name !== null ? { name: key.name } : {}),
        message: plainMessage(diagnostic.message),
        fingerprint: key.fingerprint,
      })),
    )
    .sort(
      (a, b) =>
        compareStrings(a.code, b.code) ||
        compareStrings(a.path ?? "", b.path ?? "") ||
        compareStrings(a.fingerprint, b.fingerprint),
    );
}

/** Parse a baseline file. Throws on a shape that is not an array of entries, since a misread baseline must not pass silently. */
export function parseBaseline(text: string): BaselineEntry[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("a baseline is a JSON array of entries");
  return value.map((item, i) => {
    const entry = item as Record<string, unknown>;
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.code !== "string" ||
      typeof entry.fingerprint !== "string" ||
      !(typeof entry.path === "string" || entry.path === null) ||
      !(entry.artifact === undefined || typeof entry.artifact === "string") ||
      !(entry.name === undefined || typeof entry.name === "string") ||
      !(entry.message === undefined || typeof entry.message === "string")
    ) {
      throw new Error(`baseline entry ${i} is not { code, path, artifact?, name?, message?, fingerprint }`);
    }
    return {
      code: entry.code,
      path: entry.path as string | null,
      ...(typeof entry.artifact === "string" ? { artifact: entry.artifact } : {}),
      ...(typeof entry.name === "string" ? { name: entry.name } : {}),
      ...(typeof entry.message === "string" ? { message: entry.message } : {}),
      fingerprint: entry.fingerprint,
    };
  });
}

/**
 * Apply a baseline. In migration mode an error is baselined, a "(baselined)" warning, when an entry holds each of its
 * keys, or, for a baseline written before 0.9, when one entry holds its whole message. An error with some of its
 * names held stays an error, noting the names the baseline does not hold, and the held ones are not stale. Entries
 * nothing matched are returned as stale. Strict mode returns the diagnostics unchanged.
 */
export function applyBaseline(
  diagnostics: readonly Diagnostic[],
  baseline: readonly BaselineEntry[],
  mode: Mode = "migration",
  subjectOf: (diagnostic: Diagnostic) => BaselineSubject | undefined = () => undefined,
): { diagnostics: Diagnostic[]; baselined: number; stale: BaselineEntry[] } {
  if (mode === "strict") return { diagnostics: [...diagnostics], baselined: 0, stale: [] };
  const remaining = new Map<string, BaselineEntry[]>();
  for (const entry of baseline) {
    const list = remaining.get(entry.fingerprint) ?? [];
    list.push(entry);
    remaining.set(entry.fingerprint, list);
  }
  const held = (fingerprint: string) => (remaining.get(fingerprint)?.length ?? 0) > 0;
  const take = (fingerprint: string) => remaining.get(fingerprint)?.pop();
  let baselined = 0;
  const out = diagnostics.map((diagnostic) => {
    if (diagnostic.severity !== "error") return diagnostic;
    const keys = baselineKeys(diagnostic, subjectOf(diagnostic));
    const have = keys.filter((key) => held(key.fingerprint));
    const legacy = fingerprint(diagnostic);
    if (have.length === keys.length || held(legacy)) {
      if (have.length === keys.length) for (const key of keys) take(key.fingerprint);
      else take(legacy);
      baselined++;
      return { ...diagnostic, severity: "warning" as const, message: annotate(diagnostic.message, "baselined") };
    }
    for (const key of have) take(key.fingerprint);
    if (have.length === 0) return diagnostic;
    const missing = keys.filter((key) => !have.includes(key)).map((key) => key.name ?? "it");
    return { ...diagnostic, message: annotate(diagnostic.message, `not in the baseline: ${missing.join(", ")}`) };
  });
  const stale = [...remaining.values()].flat().sort((a, b) => compareStrings(a.fingerprint, b.fingerprint));
  return { diagnostics: out, baselined, stale };
}

/** What an entry says it holds: its code, path and message, or its fingerprint when it was written without one. */
export function describeEntry(entry: BaselineEntry): string {
  const where = `${entry.code} ${entry.path ?? "(no path)"}${entry.name === undefined ? "" : ` [${entry.name}]`}`;
  return entry.message === undefined
    ? `${where} (fingerprint ${entry.fingerprint.slice(0, 16)})`
    : `${where}: ${entry.message}`;
}

/**
 * VSA014 for each entry a migration run matched to nothing. `baseline` is the whole baseline, so each diagnostic
 * points at its entry's index in the file; `path` is the file's repository-relative path when it is known.
 */
export function staleEntryDiagnostics(
  stale: readonly BaselineEntry[],
  baseline: readonly BaselineEntry[],
  path: string | null,
): Diagnostic[] {
  return stale.map((entry) => {
    const index = baseline.indexOf(entry);
    return {
      code: STALE_ENTRY_CODE,
      severity: "error" as const,
      origin: "architecture",
      artifact: entry.artifact ?? null,
      path,
      ...(index >= 0 ? { field: `/${index}` } : {}),
      message: `A baseline entry matches no diagnostic, so the violation it held is gone and the entry would let it come back: ${describeEntry(entry).replace(/\.$/, "")}.`,
      remediation:
        "Remove the entry, or write the baseline again with --write-baseline, so the baseline only shrinks (VSA §9, VSA014).",
    };
  });
}

export interface BaselineComparison {
  /** Entries the base did not hold: the baseline grew by these. */
  added: BaselineEntry[];
  /** Entries the base held that are gone: retired. */
  removed: BaselineEntry[];
  /** An entry whose file was renamed, with what it says renamed too: neither added nor retired. */
  moved: { from: BaselineEntry; to: BaselineEntry }[];
  /** A VSA005 cycle replaced by one among the same slices or fewer, with no more edges: a shrink, not growth. */
  replaced: { from: BaselineEntry; to: BaselineEntry }[];
  /**
   * An entry written before 0.9 and the entries written since for the same code, path and artifact (and message,
   * where both carry one): the same violations in the current form, one entry per name.
   */
  rewritten: { from: BaselineEntry; to: BaselineEntry[] }[];
}

const CYCLE =
  /^Slices (.+) form a compile-time dependency cycle, .*, from (\d+) observed import edges? and (\d+) declared dependsOn edges?\.$/;

function cycleOf(entry: BaselineEntry): { slices: Set<string>; edges: number } | null {
  const match = entry.code === "VSA005" && entry.message !== undefined ? CYCLE.exec(entry.message) : null;
  if (match === null) return null;
  return { slices: new Set(match[1].split(", ")), edges: Number(match[2]) + Number(match[3]) };
}

/** `text` with every renamed path in it replaced by its new path, longest old path first. */
function renamed(text: string, renames: ReadonlyMap<string, string>): string {
  let out = text;
  for (const [from, to] of [...renames].sort((a, b) => b[0].length - a[0].length || compareStrings(a[0], b[0]))) {
    out = out.split(from).join(to);
  }
  return out;
}

/**
 * What a change did to a baseline: `base` is the base's copy (null when the base has none, so every entry is new),
 * `head` the change's, `renames` the files the change renamed, old path to new. Entries are matched one for one by
 * fingerprint. Of the rest, an entry is moved when renaming its path and message gives another's, or, for an entry
 * written without a message, when its path was renamed to the other's with the same code and artifact; and a cycle
 * is replaced when the new one's slices are among the old one's and it has no more edges. Each list is sorted.
 */
export function compareBaselines(
  base: readonly BaselineEntry[] | null,
  head: readonly BaselineEntry[],
  renames: ReadonlyMap<string, string> = new Map(),
): BaselineComparison {
  const waiting = new Map<string, BaselineEntry[]>();
  for (const entry of base ?? []) {
    const list = waiting.get(entry.fingerprint) ?? [];
    list.push(entry);
    waiting.set(entry.fingerprint, list);
  }
  let added: BaselineEntry[] = [];
  for (const entry of head) {
    const list = waiting.get(entry.fingerprint);
    if (list !== undefined && list.length > 0) list.pop();
    else added.push(entry);
  }
  let removed = [...waiting.values()].flat();
  const pair = (test: (from: BaselineEntry, to: BaselineEntry) => boolean) => {
    const pairs: { from: BaselineEntry; to: BaselineEntry }[] = [];
    for (const to of [...added]) {
      const from = removed.find((candidate) => test(candidate, to));
      if (from === undefined) continue;
      pairs.push({ from, to });
      removed = removed.filter((entry) => entry !== from);
      added = added.filter((entry) => entry !== to);
    }
    return pairs;
  };
  const moved = pair((from, to) => {
    if (from.code !== to.code || from.artifact !== to.artifact || from.path === null || to.path === null) return false;
    if (from.name !== to.name) return false;
    if (renamed(from.path, renames) !== to.path) return false;
    if (from.message === undefined || to.message === undefined) return renames.get(from.path) === to.path;
    return renamed(from.message, renames) === to.message;
  });
  const replaced = pair((from, to) => {
    const old = cycleOf(from);
    const now = cycleOf(to);
    if (old === null || now === null || ![...now.slices].every((slice) => old.slices.has(slice))) return false;
    return now.slices.size < old.slices.size || now.edges <= old.edges;
  });
  const rewritten: { from: BaselineEntry; to: BaselineEntry[] }[] = [];
  for (const from of [...removed]) {
    if (from.fingerprint.startsWith(FINGERPRINT_V2)) continue;
    const to = added.filter(
      (entry) =>
        entry.fingerprint.startsWith(FINGERPRINT_V2) &&
        entry.code === from.code &&
        entry.path === from.path &&
        entry.artifact === from.artifact &&
        (from.message === undefined || entry.message === from.message),
    );
    if (to.length === 0) continue;
    rewritten.push({ from, to });
    removed = removed.filter((entry) => entry !== from);
    added = added.filter((entry) => !to.includes(entry));
  }
  const order = (a: BaselineEntry, b: BaselineEntry) =>
    compareStrings(a.code, b.code) ||
    compareStrings(a.path ?? "", b.path ?? "") ||
    compareStrings(a.fingerprint, b.fingerprint);
  const byTo = (a: { to: BaselineEntry }, b: { to: BaselineEntry }) => order(a.to, b.to);
  return {
    added: added.sort(order),
    removed: removed.sort(order),
    moved: moved.sort(byTo),
    replaced: replaced.sort(byTo),
    rewritten: rewritten.sort((a, b) => order(a.from, b.from)),
  };
}
