import assert from "node:assert/strict";
import { test } from "node:test";
import { LINK_LIFETIME_MS, linkIsValid } from "./link-expiry.ts";

test("a reset link works for one hour after it is sent", () => {
  assert.equal(LINK_LIFETIME_MS, 60 * 60 * 1000);
  assert.equal(linkIsValid(0, LINK_LIFETIME_MS - 1), true);
});

test("a reset link is refused at the hour", () => {
  assert.equal(linkIsValid(0, LINK_LIFETIME_MS), false);
});
