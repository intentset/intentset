import assert from "node:assert/strict";
import { test } from "node:test";
import { isLockedOut, LOCKOUT_MS } from "./lockout.ts";

const fiveFailures = [0, 1, 2, 3, 4];

test("the lockout starts at the fifth failed attempt in a row", () => {
  assert.equal(isLockedOut(fiveFailures.slice(0, 4), 5), false);
  assert.equal(isLockedOut(fiveFailures, 5), true);
});

test("the lockout ends 15 minutes after the last failed attempt", () => {
  assert.equal(isLockedOut(fiveFailures, 4 + LOCKOUT_MS - 1), true);
  assert.equal(isLockedOut(fiveFailures, 4 + LOCKOUT_MS), false);
});
