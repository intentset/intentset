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
 * violation does not absorb a second copy of it.
 */
import { canonicalJson, type Diagnostic, sha256Hex } from "@intentset/core";
import { annotate } from "./exceptions.ts";
import { compareStrings } from "./patterns.ts";

export type Mode = "migration" | "strict";

export interface BaselineEntry {
  code: string;
  path: string | null;
  artifact?: string;
  fingerprint: string;
}

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

/** Record every error, and every diagnostic already baselined, as the baseline to adopt. Sorted. */
export function writeBaseline(diagnostics: readonly Diagnostic[]): BaselineEntry[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "error" || isBaselined(diagnostic))
    .map((diagnostic) => ({
      code: diagnostic.code,
      path: diagnostic.path,
      ...(diagnostic.artifact !== null ? { artifact: diagnostic.artifact } : {}),
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
      !(entry.artifact === undefined || typeof entry.artifact === "string")
    ) {
      throw new Error(`baseline entry ${i} is not { code, path, artifact?, fingerprint }`);
    }
    return {
      code: entry.code,
      path: entry.path as string | null,
      ...(typeof entry.artifact === "string" ? { artifact: entry.artifact } : {}),
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
