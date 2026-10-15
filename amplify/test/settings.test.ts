import assert from "node:assert/strict";
import { test } from "node:test";
import { ALARM_EMAIL, alarmEmail } from "../settings.ts";

test("the branch's alarms go to the inbox unless the deploy names none; a sandbox's go nowhere", () => {
  assert.equal(alarmEmail(true, {}), ALARM_EMAIL);
  assert.equal(alarmEmail(true, { INTENTSET_ALARM_EMAIL: "" }), undefined);
  assert.equal(alarmEmail(true, { INTENTSET_ALARM_EMAIL: " ops@example.com " }), "ops@example.com");
  assert.equal(alarmEmail(false, {}), undefined);
  assert.equal(alarmEmail(false, { INTENTSET_ALARM_EMAIL: "ops@example.com" }), undefined);
});
