/**
 * A baseline of known violations for adoption by declared scope (VSA §9):
 * baseline the existing violations, block new ones, retire the baseline
 * progressively. In migration mode a diagnostic the baseline knows becomes a
 * warning marked "(baselined)" and is counted apart; in strict mode the
 * baseline is ignored, so the two modes are always distinguishable.
 *
 * An entry fingerprints the code, path, artifact, field and message, and the
 * messages carry no line numbers, so moving an import does not unbaseline it
 * while a new file, a new target or a larger cycle is a new fingerprint and
 * stays an error. Matching is one entry per diagnostic: a baseline of one
 * violation does not absorb a second copy of it. An entry also keeps the
 * message it was written from, so a reader of the file, or of a diff of it,
 * sees what each entry holds, and a review can tell a moved entry from a new
 * one.
 *
 * A baseline only shrinks. An entry that matches nothing in migration mode is
 * VSA014, an error: the violation it held is gone, and the entry would let it
 * come back unnoticed. `compareBaselines` says what a change added to a
 * baseline and what it retired, for `intentset review` (VSA §9).
 */
import { canonicalJson, type Diagnostic, sha256Hex } from "@intentset/core";
import { annotate } from "./exceptions.ts";
import { compareStrings } from "./patterns.ts";

export type Mode = "migration" | "strict";

export interface BaselineEntry {
  code: string;
  path: string | null;
  artifact?: string;
  /** The diagnostic's message without notes. Written since 0.9; an older file's entries have none. */
  message?: string;
  fingerprint: string;
}

/** A stale entry: reported, never recorded in a baseline. */
export const STALE_ENTRY_CODE = "VSA014";

const NOTES = / \((?:baselined|excepted by [^()]*|exception [^()]* expired [^()]*)\)(?=\.?$)/;

/** The message without the notes exceptions and baselines add. */
export function plainMessage(message: string): string {
  let out = message;
  for (let previous = ""; previous !== out; ) {
    previous = out;
    out = out.replace(NOTES, "");
  }
  return out;
}

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
 * Record every error, and every diagnostic already baselined, as the baseline to adopt. Sorted. A stale entry's
 * VSA014 is not recorded: writing the baseline again is how a stale entry is retired.
 */
export function writeBaseline(diagnostics: readonly Diagnostic[]): BaselineEntry[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "error" || isBaselined(diagnostic))
    .filter((diagnostic) => diagnostic.code !== STALE_ENTRY_CODE)
    .map((diagnostic) => ({
      code: diagnostic.code,
      path: diagnostic.path,
      ...(diagnostic.artifact !== null ? { artifact: diagnostic.artifact } : {}),
      message: plainMessage(diagnostic.message),
      fingerprint: fingerprint(diagnostic),
    }))
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
      !(entry.message === undefined || typeof entry.message === "string")
    ) {
      throw new Error(`baseline entry ${i} is not { code, path, artifact?, message?, fingerprint }`);
    }
    return {
      code: entry.code,
      path: entry.path as string | null,
      ...(typeof entry.artifact === "string" ? { artifact: entry.artifact } : {}),
      ...(typeof entry.message === "string" ? { message: entry.message } : {}),
      fingerprint: entry.fingerprint,
    };
  });
}

/**
 * Apply a baseline. In migration mode each entry turns one matching error
 * into a "(baselined)" warning; entries nothing matched are returned as
 * stale. Strict mode returns the diagnostics unchanged.
 */
export function applyBaseline(
  diagnostics: readonly Diagnostic[],
  baseline: readonly BaselineEntry[],
  mode: Mode = "migration",
): { diagnostics: Diagnostic[]; baselined: number; stale: BaselineEntry[] } {
  if (mode === "strict") return { diagnostics: [...diagnostics], baselined: 0, stale: [] };
  const remaining = new Map<string, BaselineEntry[]>();
  for (const entry of baseline) {
    const list = remaining.get(entry.fingerprint) ?? [];
    list.push(entry);
    remaining.set(entry.fingerprint, list);
  }
  let baselined = 0;
  const out = diagnostics.map((diagnostic) => {
    if (diagnostic.severity !== "error") return diagnostic;
    const list = remaining.get(fingerprint(diagnostic));
    if (list === undefined || list.length === 0) return diagnostic;
    list.pop();
    baselined++;
    return { ...diagnostic, severity: "warning" as const, message: annotate(diagnostic.message, "baselined") };
  });
  const stale = [...remaining.values()].flat().sort((a, b) => compareStrings(a.fingerprint, b.fingerprint));
  return { diagnostics: out, baselined, stale };
}

/** What an entry says it holds: its code, path and message, or its fingerprint when it was written without one. */
export function describeEntry(entry: BaselineEntry): string {
  const where = `${entry.code} ${entry.path ?? "(no path)"}`;
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
  };
}
