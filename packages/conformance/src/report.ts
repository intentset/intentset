import { relative } from "node:path";
import { repoRoot, sectionTotals } from "./harness.ts";
import type { FileResult, SuiteResult } from "./types.ts";

export interface ReportOptions {
  /** Also list passing cases, not just failures and skips. */
  verbose?: boolean;
  /** Paths are printed relative to this directory. */
  root?: string;
}

export function formatReport(result: SuiteResult, options: ReportOptions = {}): string {
  const lines: string[] = [];
  for (const file of result.files) lines.push(...formatFile(file, options));
  if (result.files.length === 0) lines.push("no case files found");
  const { pass, fail, skip } = result.totals;
  lines.push("");
  lines.push(`aspects: ${pass} passed, ${fail} failed, ${skip} skipped`);
  return lines.join("\n");
}

/** The same result as data: every file, case and aspect, plus per-section totals. */
export function formatJson(result: SuiteResult): string {
  return `${JSON.stringify(
    {
      sections: result.files.map((file) => sectionTotals(file)),
      files: result.files,
      totals: result.totals,
    },
    null,
    2,
  )}\n`;
}

function formatFile(file: FileResult, options: ReportOptions): string[] {
  const lines: string[] = [];
  const counts = sectionTotals(file);
  const location = relative(options.root ?? repoRoot, file.file);
  lines.push(
    `${file.section}  (${location})  ${counts.cases} case(s)  pass ${counts.pass}  fail ${counts.fail}  skip ${counts.skip}`,
  );

  for (const error of file.fileErrors) lines.push(`  ! ${error}`);
  for (const error of file.schemaErrors) lines.push(`  ! schema ${error.path || "/"}: ${error.message}`);

  for (const testCase of file.cases) {
    const failed = testCase.aspects.filter((a) => a.status === "fail");
    const skipped = testCase.aspects.filter((a) => a.status === "skip");
    if (failed.length === 0 && skipped.length === 0 && !options.verbose) continue;

    const mark = failed.length > 0 ? "✗" : skipped.length > 0 ? "○" : "✓";
    lines.push(`  ${mark} #${testCase.index} ${testCase.name}`);
    for (const aspect of failed) lines.push(`      ${aspect.aspect}: ${aspect.detail ?? "failed"}`);
    for (const aspect of skipped) lines.push(`      ${aspect.aspect}: skipped (${aspect.detail ?? "no reason given"})`);
  }
  return lines;
}
