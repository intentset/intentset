import assert from "node:assert/strict";
import { test } from "node:test";
import { limits } from "../functions/ask/limits.ts";
import { parseRequest } from "../functions/ask/request.ts";

test("a well-formed request parses, the question trimmed", () => {
  const parsed = parseRequest(JSON.stringify({ conversationId: "abcdef12", question: "  Why?  " }));
  assert.deepEqual(parsed, { ok: true, request: { conversationId: "abcdef12", question: "Why?", history: [] } });
});

test("a malformed request, an unknown answer block, or an answer without text is refused as malformed", () => {
  for (const value of [
    undefined,
    "",
    "[]",
    JSON.stringify({ question: "Why?" }),
    JSON.stringify({ conversationId: "bad id!", question: "Why?" }),
    JSON.stringify({ conversationId: "abcdef12", question: "   " }),
    JSON.stringify({
      conversationId: "abcdef12",
      question: "Why?",
      history: [{ question: "q", answer: [{ type: "tool_use" }] }],
    }),
    JSON.stringify({
      conversationId: "abcdef12",
      question: "Why?",
      history: [{ question: "q", answer: [{ type: "thinking" }] }],
    }),
  ]) {
    assert.deepEqual(parseRequest(value), { ok: false, problem: "malformed" }, String(value));
  }
});

test("a body over the byte limit is too long before it is parsed", () => {
  assert.deepEqual(parseRequest("x".repeat(limits.requestBytes + 1)), { ok: false, problem: "too-long" });
});
