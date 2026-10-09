import assert from "node:assert/strict";
import { test } from "node:test";
import { ask } from "../functions/ask/answer.ts";
import { getInvolvedUrl, limits, retentionDays } from "../functions/ask/limits.ts";
import { SYSTEM } from "../functions/ask/prompt.ts";
import { body, collect, corpus, deps, stubModel } from "./fixtures.ts";

test("BEH-ASK-ANSWER: the answer streams, its sources follow the block that cites them, and done carries the blocks", async () => {
  const d = deps();
  const { events, send } = collect();
  await ask(body("What is a slice?"), "203.0.113.7", d, send);
  assert.deepEqual(
    events.map((e) => e.type),
    ["text", "text", "sources", "done"],
  );
  assert.deepEqual(events[2], { type: "sources", sources: [{ url: corpus.documents[1].url, title: "Core" }] });
  const done = events[3];
  assert.equal(done.type === "done" && done.outcome, "answered");
  assert.equal(done.type === "done" && done.answer.length, 2);
});

test("the model is sent the instructions, every document ahead of the first question, and the last one cached for an hour", async () => {
  const model = stubModel();
  await ask(body("What is a slice?"), "203.0.113.7", deps(model), () => {});
  const [{ system, messages }] = model.calls;
  assert.equal(system, SYSTEM);
  assert.doesNotMatch(SYSTEM, /\d{4}-\d{2}-\d{2}/, "no date in the cached prefix");
  const content = messages[0].content as unknown as Array<Record<string, unknown>>;
  assert.equal(content.length, corpus.documents.length + 1);
  assert.deepEqual(content.at(-2)?.cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(content.filter((block) => block.cache_control).length, 1);
  assert.deepEqual(content.at(-1), { type: "text", text: "What is a slice?" });
});

test("a follow-up sends the earlier answer back exactly as done gave it", async () => {
  const model = stubModel();
  const d = deps(model);
  const first = collect();
  await ask(body("What is a slice?"), "203.0.113.7", d, first.send);
  const done = first.events.at(-1);
  assert.ok(done?.type === "done");
  await ask(body("And a rule?", [{ question: "What is a slice?", answer: done.answer }]), "203.0.113.7", d, () => {});
  const messages = model.calls[1].messages;
  assert.deepEqual(
    messages.map((m) => m.role),
    ["user", "assistant", "user"],
  );
  assert.deepEqual(messages[1].content, done.answer);
  assert.deepEqual(messages[2].content, [{ type: "text", text: "And a rule?" }]);
});

test("BEH-ASK-NOT-IN-DOCS: an answer that cites nothing is kept as uncited, which is how gaps show", async () => {
  const d = deps(stubModel({ cites: [] }));
  const { events, send } = collect();
  await ask(body("What is the weather?"), "203.0.113.7", d, send);
  assert.equal(
    events.some((e) => e.type === "sources"),
    false,
  );
  assert.equal(d.store.questions[0].outcome, "uncited");
});

test("BEH-ASK-CONTACT: an answer that sends the visitor to the get-involved page is marked as a contact request", async () => {
  const d = deps(stubModel({ text: `You can reach the team at ${getInvolvedUrl}.`, cites: [] }));
  await ask(body("How do I contact you?"), "203.0.113.7", d, () => {});
  assert.equal(d.store.questions[0].outcome, "contact");
  assert.equal(d.store.questions[0].contact, true);
});

test("BEH-ASK-LIMITS: too long, too many turns, malformed, switched off, over budget and over the visitor's limit cost no model call and keep nothing", async () => {
  const cases: Array<[string, (d: ReturnType<typeof deps>) => string, string]> = [
    ["too-long", () => body("x".repeat(limits.questionChars + 1)), "refused"],
    [
      "too-many-turns",
      () =>
        body(
          "again?",
          Array.from({ length: limits.turns }, () => ({ question: "q", answer: [{ type: "text", text: "a" }] })),
        ),
      "refused",
    ],
    ["malformed", () => "{not json", "error"],
    [
      "off",
      (d) => {
        d.store.items.set("switch", { key: "switch", state: "off" });
        return body("Hello?");
      },
      "refused",
    ],
    [
      "budget",
      (d) => {
        d.store.items.set("budget#2026-10-09", { key: "budget#2026-10-09", value: limits.dailyBudgetUsd * 1_000_000 });
        return body("Hello?");
      },
      "refused",
    ],
  ];
  for (const [reason, make, type] of cases) {
    const model = stubModel();
    const d = deps(model);
    const { events, send } = collect();
    await ask(make(d), "203.0.113.7", d, send);
    assert.deepEqual(events, [{ type, reason }], reason);
    assert.equal(model.calls.length, 0, reason);
    assert.equal(d.store.questions.length, 0, reason);
  }
});

test("a visitor is counted by a salted hash of the IP, refused past the day's limit, and other visitors are not", async () => {
  const model = stubModel();
  const d = deps(model);
  for (let i = 0; i < limits.visitorPerDay; i++) await ask(body("Hello?"), "203.0.113.7", d, () => {});
  const { events, send } = collect();
  await ask(body("Hello?"), "203.0.113.7", d, send);
  assert.deepEqual(events, [{ type: "refused", reason: "visitor-limit" }]);
  await ask(body("Hello?"), "198.51.100.1", d, () => {});
  assert.equal(model.calls.length, limits.visitorPerDay + 1);
  const keys = [...d.store.items.keys()];
  assert.ok(
    keys.every((key) => !key.includes("203.0.113.7")),
    "no address in a key",
  );
  assert.ok(keys.some((key) => key === "salt#2026-10-09"));
});

test("the day's spend grows by each answer's estimated cost", async () => {
  const d = deps();
  await ask(body("Hello?"), "203.0.113.7", d, () => {});
  // 100 input × $4 + 200 output × $20 + 40,000 cache reads × $0.20, per million tokens, in micro-dollars.
  assert.equal(d.store.items.get("budget#2026-10-09")?.value, 100 * 4 + 200 * 20 + 40_000 * 0.2);
});

test("BEH-ASK-KEEP-QUESTION: the question and answer are kept scrubbed, with sources, tokens and corpus, for the retention period", async () => {
  const d = deps(stubModel({ text: "Write to jane@example.com or call +1 (555) 123-4567." }));
  await ask(body("I'm jane@example.com, call me on 555 123 4567"), "203.0.113.7", d, () => {});
  const [record] = d.store.questions;
  assert.equal(record.question, "I'm [email], call me on [phone]");
  assert.equal(record.answer, "Write to [email] or call [phone].");
  assert.deepEqual(record.sources, [corpus.documents[1].url]);
  assert.equal(record.corpusHash, corpus.hash);
  assert.equal(record.turn, 1);
  assert.equal(record.expiresAt, Date.parse("2026-10-09T12:00:00Z") / 1000 + retentionDays * 86_400);
  assert.equal(JSON.stringify(record).includes("203.0.113.7"), false, "no address in the record");
});

test("a model failure tells the visitor and is kept as failed; a refusal by the model is said as such", async () => {
  const failed = deps(stubModel({ fail: true }));
  const one = collect();
  await ask(body("Hello?"), "203.0.113.7", failed, one.send);
  assert.deepEqual(one.events, [{ type: "error", reason: "model" }]);
  assert.equal(failed.store.questions[0].outcome, "failed");

  const declined = deps(stubModel({ stopReason: "refusal", cites: [] }));
  const two = collect();
  await ask(body("Hello?"), "203.0.113.7", declined, two.send);
  assert.deepEqual(two.events.at(-1), { type: "refused", reason: "declined" });
  assert.equal(declined.store.questions[0].outcome, "refused-by-model");
});

test("each answer's estimated cost, and each refusal for the budget, is a metric line carrying only a number", async (t) => {
  const lines: string[] = [];
  t.mock.method(console, "log", (line: string) => lines.push(line));
  const d = deps();
  await ask(body("Hello?"), "203.0.113.7", d, () => {});
  d.store.items.set("budget#2026-10-09", { key: "budget#2026-10-09", value: limits.dailyBudgetUsd * 1_000_000 });
  await ask(body("Hello?"), "203.0.113.7", d, () => {});
  const metrics = lines.map((line) => JSON.parse(line)).filter((entry) => entry._aws);
  assert.deepEqual(
    metrics.map((entry) => [entry._aws.CloudWatchMetrics[0].Metrics[0].Name, entry.CostMicros ?? entry.BudgetRefused]),
    [
      ["CostMicros", 100 * 4 + 200 * 20 + 40_000 * 0.2],
      ["BudgetRefused", 1],
    ],
  );
});

test("when storing fails, the visitor still gets the answer", async () => {
  const d = deps();
  d.store.failQuestions = true;
  const { events, send } = collect();
  await ask(body("Hello?"), "203.0.113.7", d, send);
  assert.equal(events.at(-1)?.type, "done");
});

test("RULE-ASK-NO-IDENTITY: no question, answer or address reaches the log", async (t) => {
  const lines: string[] = [];
  t.mock.method(console, "log", (line: string) => lines.push(line));
  const secret = "my-private-question-about-zebras";
  const d = deps(stubModel({ text: "an answer mentioning okapis" }));
  await ask(body(secret), "203.0.113.7", d, () => {});
  await ask(body("x".repeat(limits.questionChars + 1)), "203.0.113.7", d, () => {});
  await ask(body(secret), "203.0.113.7", deps(stubModel({ fail: true })), () => {});
  const all = lines.join("\n");
  assert.ok(lines.length >= 3);
  for (const leak of [secret, "okapis", "203.0.113.7"]) assert.equal(all.includes(leak), false, leak);
});
