/**
 * Comparisons between what a case states and what a driver observed. Each
 * returns null when the two agree and a one-line description of the first
 * difference when they do not, so a report can say where without the reader
 * diffing two JSON dumps.
 */
import type { Diagnostic } from "@intentset/core";

/**
 * Multiset comparison of diagnostic codes, order-insensitive. The first
 * difference names a code the case wanted and did not get, or got and did not
 * want, followed by every diagnostic actually produced.
 */
export function compareCodes(expected: readonly string[], actual: readonly Diagnostic[]): string | null {
  const want = count(expected);
  const got = count(actual.map((d) => d.code));
  const codes = [...new Set([...want.keys(), ...got.keys()])].sort();
  for (const code of codes) {
    const w = want.get(code) ?? 0;
    const g = got.get(code) ?? 0;
    if (w === g) continue;
    const head = g < w ? `missing ${code} (expected ${w}, got ${g})` : `unexpected ${code} (expected ${w}, got ${g})`;
    return `${head}; expected [${[...expected].sort().join(", ")}]${describeDiagnostics(actual)}`;
  }
  return null;
}

function describeDiagnostics(diagnostics: readonly Diagnostic[]): string {
  if (diagnostics.length === 0) return ", got none";
  const lines = diagnostics.map(
    (d) =>
      `\n        ${d.code} ${d.severity} ${d.origin} ${d.path ?? "-"}${d.location ? `:${d.location.line}` : ""}` +
      `${d.artifact ? ` ${d.artifact}` : ""}${d.field ? ` ${d.field}` : ""}: ${d.message}`,
  );
  return `, got:${lines.join("")}`;
}

function count(codes: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return counts;
}

/** Two lists of IDs are the same when they sort the same. */
export function compareIds(expected: readonly string[], actual: readonly string[]): string | null {
  const want = [...expected].sort();
  const got = [...actual].sort();
  if (JSON.stringify(want) === JSON.stringify(got)) return null;
  const missing = want.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !want.includes(id));
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing [${missing.join(", ")}]`);
  if (extra.length > 0) parts.push(`unexpected [${extra.join(", ")}]`);
  if (parts.length === 0) parts.push("a duplicate ID");
  return `${parts.join(", ")}; got [${got.join(", ")}]`;
}

/**
 * Deep partial match: every key the expectation names must be present and
 * match; keys it does not name are free. Arrays must have the same length and
 * match element by element, each element partially. Object key order is
 * ignored. Returns the first difference as a JSON pointer and a reason.
 */
export function firstMismatch(expected: unknown, actual: unknown, path = ""): string | null {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path || "/"}: expected an array, got ${show(actual)}`;
    if (expected.length !== actual.length) {
      return `${path || "/"}: expected ${expected.length} item(s), got ${actual.length}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const diff = firstMismatch(expected[i], actual[i], `${path}/${i}`);
      if (diff) return diff;
    }
    return null;
  }
  if (isObject(expected)) {
    if (!isObject(actual)) return `${path || "/"}: expected an object, got ${show(actual)}`;
    for (const key of Object.keys(expected).sort()) {
      const child = `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (!Object.hasOwn(actual, key)) return `${child}: expected ${show(expected[key])}, got <absent>`;
      const diff = firstMismatch(expected[key], actual[key], child);
      if (diff) return diff;
    }
    return null;
  }
  if (expected === actual || (Number.isNaN(expected) && Number.isNaN(actual))) return null;
  return `${path || "/"}: expected ${show(expected)}, got ${show(actual)}`;
}

/** Exact structural equality: a partial match in both directions. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return firstMismatch(a, b) === null && firstMismatch(b, a) === null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function show(value: unknown): string {
  if (value === undefined) return "<absent>";
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
