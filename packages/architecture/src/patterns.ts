/**
 * VSA §3 path patterns: repository-relative POSIX paths made of literal
 * segments, `*` within one segment, and `**` across zero or more segments.
 * Nothing else is special: `?`, `[` and `]` are literal characters, because
 * real trees have directories named `[id]`. A `*` never matches `/`, so the
 * only way to write a star that spans segments is `**` mixed with other
 * characters, which validatePattern rejects.
 */

/** Why a pattern is not a v0.1 pattern, or null when it is one. */
export function validatePattern(pattern: string): string | null {
  if (pattern === "") return "is empty";
  if (pattern.startsWith("/")) return "is absolute";
  if (pattern.includes("\\")) return "uses a backslash; patterns are POSIX paths";
  if (/[{}]/.test(pattern)) return "uses brace expansion";
  if (pattern.includes("!")) return "uses negation";
  const segments = pattern.split("/");
  if (segments.includes("..")) return "contains `..`";
  if (segments.includes(".")) return "contains a `.` segment";
  if (segments.includes("")) return "has an empty segment";
  for (const segment of segments) {
    if (segment.includes("**") && segment !== "**")
      return `puts \`**\` inside the segment \`${segment}\`; \`**\` stands alone`;
  }
  return null;
}

type Segment = { kind: "globstar" } | { kind: "literal"; text: string } | { kind: "glob"; regex: RegExp };

const compiled = new Map<string, Segment[]>();

function compile(pattern: string): Segment[] {
  let segments = compiled.get(pattern);
  if (segments !== undefined) return segments;
  segments = pattern.split("/").map((text): Segment => {
    if (text === "**") return { kind: "globstar" };
    if (!text.includes("*")) return { kind: "literal", text };
    const source = text
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]*");
    return { kind: "glob", regex: new RegExp(`^${source}$`) };
  });
  compiled.set(pattern, segments);
  return segments;
}

/** Does a repository-relative path match a VSA §3 pattern? Invalid patterns match nothing. */
export function matchPattern(pattern: string, path: string): boolean {
  if (validatePattern(pattern) !== null) return false;
  const want = compile(pattern);
  const have = path.split("/");
  const memo = new Map<number, boolean>();
  const step = (p: number, s: number): boolean => {
    const key = p * (have.length + 1) + s;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let result: boolean;
    if (p === want.length) result = s === have.length;
    else {
      const segment = want[p];
      if (segment.kind === "globstar") result = step(p + 1, s) || (s < have.length && step(p, s + 1));
      else if (s === have.length) result = false;
      else if (segment.kind === "literal") result = segment.text === have[s] && step(p + 1, s + 1);
      else result = segment.regex.test(have[s]) && step(p + 1, s + 1);
    }
    memo.set(key, result);
    return result;
  };
  return step(0, 0);
}

/** True when any of the patterns matches the path. */
export function matchAny(patterns: readonly string[], path: string): boolean {
  return patterns.some((pattern) => matchPattern(pattern, path));
}

/**
 * Resolve each claim against the repository's files: for claim i, the sorted
 * files it matches, minus those any ignore pattern matches (VSA §3: source
 * enumeration uses a versioned ignore list). An invalid pattern resolves to
 * nothing; the caller reports it.
 */
export function expandClaims(
  claims: readonly { path: string }[],
  files: Iterable<string>,
  ignore: readonly string[],
): string[][] {
  const candidates = [...files].filter((file) => !matchAny(ignore, file)).sort(compareStrings);
  return claims.map((claim) => candidates.filter((file) => matchPattern(claim.path, file)));
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
