/**
 * The pattern language of `.intentset/config.yaml` scope and ignore lists,
 * which is VSA §3's: repository-relative POSIX paths made of literal segments,
 * `*` within one segment, and `**` across zero or more segments. Nothing else
 * is special: no `?`, no classes, no braces, no negation, so there is no
 * precedence to explain. A pattern and a path match segment by segment, and
 * `*` never crosses a `/`.
 *
 * The architecture package has its own copy for claims. Duplicating thirty
 * lines keeps the CLI's core commands independent of it.
 */

/** VSA §3: true when the repository-relative POSIX `path` matches `pattern`. */
export function matchGlob(pattern: string, path: string): boolean {
  const p = normalize(pattern).split("/");
  const s = path.split("/");
  // Memo of (pattern index, path index) pairs already known not to match, so
  // several `**` in one pattern stay polynomial rather than exponential.
  const failed = new Set<number>();
  const width = s.length + 1;
  const match = (i: number, j: number): boolean => {
    if (failed.has(i * width + j)) return false;
    let ok: boolean;
    if (i === p.length) ok = j === s.length;
    else if (p[i] === "**") ok = match(i + 1, j) || (j < s.length && match(i, j + 1));
    else ok = j < s.length && matchSegment(p[i], s[j]) && match(i + 1, j + 1);
    if (!ok) failed.add(i * width + j);
    return ok;
  };
  return match(0, 0);
}

/** True when any of `patterns` matches `path`. */
export function matchAny(patterns: readonly string[], path: string): boolean {
  return patterns.some((pattern) => matchGlob(pattern, path));
}

/** A leading `./` names the same path; repeated `/` separate nothing. */
function normalize(pattern: string): string {
  return pattern.replace(/^(?:\.\/)+/, "").replace(/\/{2,}/g, "/");
}

const SEGMENTS = new Map<string, RegExp>();

/** One segment: literal text, with each `*` standing for any run of characters other than `/`. */
function matchSegment(pattern: string, name: string): boolean {
  if (!pattern.includes("*")) return pattern === name;
  let regex = SEGMENTS.get(pattern);
  if (regex === undefined) {
    const body = pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]*");
    regex = new RegExp(`^${body}$`);
    SEGMENTS.set(pattern, regex);
  }
  return regex.test(name);
}
