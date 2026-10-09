import assert from "node:assert/strict";
import { test } from "node:test";
import { scrub } from "../functions/ask/scrub.ts";

test("scrub replaces emails, phone numbers and key-like strings, and leaves ordinary text alone", () => {
  assert.equal(scrub("mail me: a.b+c@example.co.uk"), "mail me: [email]");
  assert.equal(scrub("call +44 20 7946 0958 now"), "call [phone] now");
  assert.equal(scrub("key AKIAIOSFODNN7EXAMPLE here"), "key [key] here");
  assert.equal(scrub("token ghp_abcdefghijklmnopqrstuvwxyz0123"), "token [key]");
  assert.equal(scrub("sk-ant-api03-abcdefghijklmnop"), "[key]");
  assert.equal(scrub("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijkl"), "jwt [key]");
  const plain = "Is Intentset v0.1 compatible with Core §5 and CORE009 in 2026? See BEH-ASK-ANSWER and 3 slices.";
  assert.equal(scrub(plain), plain);
  assert.equal(scrub("version 0.6.1 and 12 records"), "version 0.6.1 and 12 records");
});
