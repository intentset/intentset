/**
 * @intentset/verification: run records, evidence freshness, coverage and
 * test-reporter adapters (Core §8, §10, §11; milestone M3). Definitions are
 * not evidence: only a pass at the assessed commit and graph hash is current,
 * and link coverage and current-pass coverage are always counted apart.
 */
export * from "./adapters/common.ts";
export * from "./adapters/node-test.ts";
export * from "./adapters/vitest.ts";
export * from "./check.ts";
export * from "./classify.ts";
export * from "./coverage.ts";
export * from "./fixture.ts";
export * from "./placeholders.ts";
export * from "./records.ts";
export * from "./report.ts";
