/**
 * `node --test --test-reporter=tap`: TAP version 13 as Node's test runner
 * writes it. Each test is announced by `# Subtest: <title>` and reported by an
 * `ok` or `not ok` line at the same indentation, four spaces per level of
 * nesting, followed by a YAML diagnostic block. A test's full title is its
 * ancestors' titles and its own, joined with " > ".
 *
 * Results: `ok` is pass; `# SKIP` and `# TODO` are skip; `not ok` is fail when
 * an assertion failed and error when anything else went wrong (a thrown
 * non-assertion, a hook failure, a timeout, a cancellation). A test with
 * subtests is not counted on its own unless it failed for a reason of its
 * own: its subtests are what carry the result.
 */
import type { RunResult } from "../records.ts";
import type { ParsedRun, ParsedTest } from "./common.ts";

const SUBTEST = /^# Subtest: (.*)$/;
const TEST_POINT = /^(not ok|ok)\b(?:\s+\d+)?(?:\s+-)?\s*(.*)$/;
const ASSERTION_CODE = "ERR_ASSERTION";

export function parseNodeTap(text: string): ParsedRun {
  const lines = text.split(/\r?\n/);
  const titles: string[] = [];
  const hasChild: boolean[] = [];
  const tests: ParsedTest[] = [];
  const problems: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const indent = line.length - line.trimStart().length;
    const body = line.slice(indent);
    const depth = Math.floor(indent / 4);

    const subtest = SUBTEST.exec(body);
    if (subtest !== null) {
      titles[depth] = unescapeTap(subtest[1]);
      titles.length = depth + 1;
      hasChild[depth] = false;
      hasChild.length = depth + 1;
      i++;
      continue;
    }

    const point = TEST_POINT.exec(body);
    if (point === null) {
      if (body.startsWith("Bail out!")) problems.push(body);
      i++;
      continue;
    }

    i++;
    const yaml = new Map<string, string>();
    if (i < lines.length && lines[i].trim() === "---") {
      const blockIndent = lines[i].length - lines[i].trimStart().length;
      i++;
      while (i < lines.length) {
        const current = lines[i];
        const currentIndent = current.length - current.trimStart().length;
        i++;
        if (current.trim() === "..." && currentIndent === blockIndent) break;
        if (currentIndent !== blockIndent) continue;
        const pair = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/.exec(current.slice(blockIndent));
        if (pair !== null) yaml.set(pair[1], unquote(pair[2] ?? ""));
      }
    }

    const { title, directive } = splitDirective(point[2]);
    const parent = hasChild[depth] === true;
    hasChild[depth] = false;
    if (depth > 0) hasChild[depth - 1] = true;

    const failureType = yaml.get("failureType");
    const result = resultOf(point[1] === "ok", directive, failureType, yaml);
    if (parent && (result === "pass" || result === "skip" || failureType === "subtestsFailed")) continue;

    const ancestors = titles.slice(0, depth).filter((t) => t !== undefined);
    const duration = Number(yaml.get("duration_ms"));
    tests.push({
      fullName: [...ancestors, title].join(" > "),
      result,
      durationMs: yaml.has("duration_ms") && Number.isFinite(duration) ? duration : null,
    });
  }
  return { tests, problems };
}

function resultOf(
  ok: boolean,
  directive: "skip" | "todo" | null,
  failureType: string | undefined,
  yaml: Map<string, string>,
): RunResult {
  if (directive !== null) return "skip";
  if (ok) return "pass";
  if (failureType === "subtestsFailed") return "fail";
  const assertion = yaml.get("code") === ASSERTION_CODE || yaml.get("name") === "AssertionError";
  if (assertion) return "fail";
  if (failureType === undefined) return "fail";
  return "error";
}

/** Split a test point's description at its first unescaped `#` into the title and the directive. */
function splitDirective(description: string): { title: string; directive: "skip" | "todo" | null } {
  for (let i = 0; i < description.length; i++) {
    const c = description[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c !== "#") continue;
    const rest = description.slice(i + 1).trim();
    const directive = /^skip\b/i.test(rest) ? "skip" : /^todo\b/i.test(rest) ? "todo" : null;
    return { title: unescapeTap(description.slice(0, i).trimEnd()), directive };
  }
  return { title: unescapeTap(description.trimEnd()), directive: null };
}

const ESCAPES: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" };

/** Undo Node's TAP escaping: `\\`, `\#` and the control-character escapes. */
function unescapeTap(text: string): string {
  return text.replace(/\\(.)/g, (_, c: string) => ESCAPES[c] ?? c);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}
