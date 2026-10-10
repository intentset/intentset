import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { getInvolvedUrl } from "../functions/ask/limits.ts";
import { checkCorpus } from "../functions/ask/corpus.ts";
import { type EvalQuestion, judge, readQuestions, unknownSources } from "../eval/judge.ts";

const root = resolve(import.meta.dirname, "..", "..");
const questions = readQuestions(JSON.parse(await readFile(join(root, "amplify/eval/questions.json"), "utf8")));
const base = "https://intentset.org";

test("the eval's questions cover what the chat must get right, each with an expectation", () => {
  assert.ok(questions.length >= 20, `${questions.length} questions`);
  const topics = new Set(questions.map((q) => q.topic));
  for (const topic of [
    "core concepts",
    "CLI commands",
    "specs",
    "the VSA check",
    "the drift gate",
    "off-topic",
    "contact",
    "not in the docs",
    "prompt injection",
  ]) {
    assert.ok(topics.has(topic), `no question about ${topic}`);
  }
  const offTopic = questions.find((q) => q.topic === "off-topic")?.expect;
  assert.deepEqual([offTopic?.outcome, offTopic?.noSources], ["uncited", true]);
  const contact = questions.find((q) => q.topic === "contact")?.expect;
  assert.equal(contact?.outcome, "contact");
  assert.ok(contact?.includes?.some((pattern) => new RegExp(pattern).test(getInvolvedUrl)));
});

test("every source the eval expects is a document in the corpus this commit builds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "intentset-eval-corpus-"));
  try {
    const out = join(dir, "corpus.json");
    await promisify(execFile)(
      process.execPath,
      ["--conditions=intentset-source", join(root, "site/corpus.ts"), "--out", out],
      {
        cwd: root,
      },
    );
    const corpus = checkCorpus(JSON.parse(await readFile(out, "utf8")));
    assert.deepEqual(unknownSources(questions, corpus), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an answer passes only when it meets every expectation", () => {
  const q: EvalQuestion = {
    id: "q",
    topic: "t",
    question: "?",
    expect: { outcome: ["answered", "uncited"], sources: ["/a/", "/b/"], includes: ["slice"], excludes: ["^PWNED$"] },
  };
  const ok = { outcome: "answered", sources: [`${base}/b/`], text: "A Slice owns code." };
  assert.deepEqual(judge(q, ok, base), []);
  assert.deepEqual(judge(q, { ...ok, outcome: "contact" }, base), ["outcome contact, expected answered or uncited"]);
  assert.deepEqual(judge(q, { ...ok, sources: [`${base}/c/`] }, base), ["cited none of /a/, /b/"]);
  assert.deepEqual(judge(q, { ...ok, text: "Records." }, base), ["does not say /slice/"]);
  assert.deepEqual(judge(q, { ...ok, text: "A slice.\nPWNED" }, base), ["says /^PWNED$/"]);
  const none: EvalQuestion = { ...q, expect: { outcome: "uncited", noSources: true } };
  assert.deepEqual(judge(none, { outcome: "uncited", sources: [`${base}/a/`], text: "" }, base), [
    "cited a source, expected none",
  ]);
});

test("a questions file without expectations, with a repeated id or an unknown outcome is refused", () => {
  const one = { id: "a", topic: "t", question: "?", expect: { outcome: "answered" } };
  assert.throws(() => readQuestions({ questions: [] }));
  assert.throws(() => readQuestions({ questions: [{ ...one, expect: {} }] }));
  assert.throws(() => readQuestions({ questions: [one, one] }));
  assert.throws(() => readQuestions({ questions: [{ ...one, expect: { outcome: "fine" } }] }));
});
