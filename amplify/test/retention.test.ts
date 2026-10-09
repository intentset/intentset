import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { retentionDays, visitorHashHours } from "../functions/ask/limits.ts";
import { ask } from "../functions/ask/resource.ts";

/**
 * RULE-ASK-RETENTION: the privacy page states the periods the backend keeps things for. A changed period changes the
 * page in the same commit, or this fails.
 */
test("the privacy page states the questions' retention, the visitor counter's and the logs'", async () => {
  const page = await readFile(new URL("../../site/content/privacy.md", import.meta.url), "utf8");
  assert.equal(retentionDays, 90);
  assert.match(page, new RegExp(`for ${retentionDays} days`));
  assert.match(page, new RegExp(`deleted after ${retentionDays} days`));
  assert.match(page, new RegExp(`deleted after ${visitorHashHours} hours`));
  assert.ok(ask, "the function resource loads");
  const resource = await readFile(new URL("../functions/ask/resource.ts", import.meta.url), "utf8");
  assert.match(resource, /retention: "1 month"/);
  assert.match(page, /logs keep no questions or answers, and are deleted after a month/);
});
