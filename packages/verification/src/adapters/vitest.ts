/**
 * `vitest run --reporter=json`: `testResults[]`, one per file, each with
 * `assertionResults[]` carrying `ancestorTitles`, `title`, `fullName`,
 * `status` and `failureMessages`. Results: passed is pass; skipped, pending,
 * todo and disabled are skip; failed is fail when the failure is an
 * assertion and error when the test threw anything else. A file that failed
 * without reporting any test (it did not load) is listed in `problems`,
 * since no test title can carry it to a selector.
 */
import type { RunResult } from "../records.ts";
import type { ParsedRun, ParsedTest } from "./common.ts";

const STATUSES: Record<string, RunResult | "failed"> = {
  passed: "pass",
  failed: "failed",
  skipped: "skip",
  pending: "skip",
  todo: "skip",
  disabled: "skip",
};

export function parseVitestJson(json: unknown): ParsedRun {
  if (!isRecord(json) || !Array.isArray(json.testResults)) {
    throw new TypeError("This is not Vitest JSON reporter output: expected an object with a testResults array.");
  }
  const tests: ParsedTest[] = [];
  const problems: string[] = [];
  json.testResults.forEach((file, fileIndex) => {
    if (!isRecord(file)) throw new TypeError(`testResults[${fileIndex}] is not an object.`);
    const name = typeof file.name === "string" ? file.name : `testResults[${fileIndex}]`;
    const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
    if (assertions.length === 0 && file.status === "failed") {
      problems.push(`${name} failed without running a test: ${firstLine(file.message) || "no message"}`);
    }
    assertions.forEach((assertion, index) => {
      if (!isRecord(assertion))
        throw new TypeError(`testResults[${fileIndex}].assertionResults[${index}] is not an object.`);
      const title = typeof assertion.title === "string" ? assertion.title : "";
      const ancestors = Array.isArray(assertion.ancestorTitles)
        ? assertion.ancestorTitles.filter((t): t is string => typeof t === "string")
        : [];
      const fullName =
        typeof assertion.fullName === "string" && assertion.fullName !== ""
          ? assertion.fullName
          : [...ancestors, title].join(" > ");
      const status = typeof assertion.status === "string" ? STATUSES[assertion.status] : undefined;
      let result: RunResult;
      if (status === undefined) {
        problems.push(`${fullName} has the unknown status ${JSON.stringify(assertion.status)}, read as error`);
        result = "error";
      } else if (status === "failed") {
        const messages = Array.isArray(assertion.failureMessages) ? assertion.failureMessages : [];
        result = failureKind(typeof messages[0] === "string" ? messages[0] : "");
      } else {
        result = status;
      }
      const duration = assertion.duration;
      tests.push({
        fullName,
        result,
        durationMs: typeof duration === "number" && Number.isFinite(duration) ? duration : null,
      });
    });
  });
  return { tests, problems };
}

/** An assertion failure is fail; any other thrown error class is error; a bare message is a failed expectation. */
function failureKind(message: string): RunResult {
  const head = message.trimStart();
  if (/^AssertionError\b/.test(head)) return "fail";
  if (/^[A-Za-z]*Error\b/.test(head)) return "error";
  return "fail";
}

function firstLine(value: unknown): string {
  return typeof value === "string" ? (value.trim().split("\n")[0] ?? "") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
