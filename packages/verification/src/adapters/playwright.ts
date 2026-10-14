/**
 * `playwright test --reporter=json`: `suites[]`, each a file whose `suites[]` are `describe` groups and whose
 * `specs[]` are the tests, each spec holding one `tests[]` entry per project it ran in. A test's full name is its
 * describe titles and its own, joined with " > " (the file's own suite is left out, as the runner's list reporter
 * leaves it out), so a selector is matched as it is for the other runners; a test that runs in several projects makes
 * one `ParsedTest` for each, and the worst of them is the verification's result.
 *
 * Results follow the test's own `status`: expected is pass (a `test.fail()` that failed as declared is expected),
 * skipped is skip (`test.skip` and `test.fixme` are skipped), flaky is pass (it failed and passed on a retry, and the
 * retry policy is the project's), and unexpected is fail when its last attempt was an assertion and error when it
 * timed out, was interrupted or threw anything else. Errors the report lists for the whole run (a global setup that
 * failed) are listed in `problems`, since no test title can carry them to a selector.
 */
import type { RunResult } from "../records.ts";
import type { ParsedRun, ParsedTest } from "./common.ts";

export function parsePlaywrightJson(json: unknown): ParsedRun {
  if (!isRecord(json) || !Array.isArray(json.suites)) {
    throw new TypeError("This is not Playwright JSON reporter output: expected an object with a suites array.");
  }
  const tests: ParsedTest[] = [];
  const problems: string[] = [];
  if (Array.isArray(json.errors)) {
    for (const error of json.errors) {
      problems.push(`The run reported an error: ${firstLine(isRecord(error) ? error.message : error) || "no message"}`);
    }
  }
  json.suites.forEach((file, index) => {
    if (!isRecord(file)) throw new TypeError(`suites[${index}] is not an object.`);
    walk(file, [], tests, problems);
  });
  return { tests, problems };
}

function walk(suite: Record<string, unknown>, ancestors: string[], tests: ParsedTest[], problems: string[]): void {
  for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
    if (!isRecord(spec)) throw new TypeError("A spec in the report is not an object.");
    const title = typeof spec.title === "string" ? spec.title : "";
    const fullName = [...ancestors, title].join(" > ");
    for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
      if (!isRecord(test)) throw new TypeError(`${fullName} has a test entry that is not an object.`);
      const result = resultOf(test, fullName, problems);
      tests.push({ fullName, result, durationMs: durationOf(test) });
    }
  }
  for (const child of Array.isArray(suite.suites) ? suite.suites : []) {
    if (!isRecord(child)) throw new TypeError("A suite in the report is not an object.");
    const title = typeof child.title === "string" ? child.title : "";
    walk(child, title === "" ? ancestors : [...ancestors, title], tests, problems);
  }
}

function resultOf(test: Record<string, unknown>, fullName: string, problems: string[]): RunResult {
  switch (test.status) {
    case "expected":
    case "flaky":
      return "pass";
    case "skipped":
      return "skip";
    case "unexpected":
      return failureKind(lastResult(test));
    default:
      problems.push(`${fullName} has the unknown status ${JSON.stringify(test.status)}, read as error`);
      return "error";
  }
}

/** A timeout or an interrupted run is an error; an assertion that did not hold is a fail; anything else thrown is an error. */
function failureKind(last: Record<string, unknown> | undefined): RunResult {
  if (last === undefined) return "fail";
  if (last.status === "timedOut" || last.status === "interrupted") return "error";
  const error = isRecord(last.error) ? last.error : undefined;
  const message = typeof error?.message === "string" ? error.message : "";
  return /\bexpect\(|AssertionError/.test(message) || message === "" ? "fail" : "error";
}

function lastResult(test: Record<string, unknown>): Record<string, unknown> | undefined {
  const results = Array.isArray(test.results) ? test.results : [];
  const last = results[results.length - 1];
  return isRecord(last) ? last : undefined;
}

function durationOf(test: Record<string, unknown>): number | null {
  const duration = lastResult(test)?.duration;
  return typeof duration === "number" && Number.isFinite(duration) ? duration : null;
}

function firstLine(value: unknown): string {
  return typeof value === "string" ? (value.trim().split("\n")[0] ?? "") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
