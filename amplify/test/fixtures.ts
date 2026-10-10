import type { AskEvent, Deps } from "../functions/ask/answer.ts";
import type { Corpus } from "../functions/ask/corpus.ts";
import type { Model, ModelEvent, ModelResult } from "../functions/ask/model.ts";
import { MemoryStore } from "./memory-store.ts";

export const corpus: Corpus = {
  format: "intentset-chat-corpus/1",
  version: "0.0.0-test",
  hash: "a".repeat(64),
  documents: [
    { url: "https://intentset.org/", title: "Home", kind: "page", source: "site/content/index.md", text: "Home text." },
    {
      url: "https://intentset.org/specifications/core/",
      title: "Core",
      kind: "specification",
      source: "spec/core-0.1.md",
      text: "Core text.",
    },
  ],
};

/** A model that streams the given text in two pieces, citing the given documents, and records what it was sent. */
export function stubModel(
  options: { text?: string; cites?: number[]; stopReason?: string; fail?: boolean } = {},
): Model & { calls: Parameters<Model>[0][] } {
  const calls: Parameters<Model>[0][] = [];
  const text = options.text ?? "Intentset keeps records.";
  const fn = (async (request, onEvent: (event: ModelEvent) => void): Promise<ModelResult> => {
    calls.push(request);
    if (options.fail) throw new Error("model down");
    const half = Math.floor(text.length / 2);
    onEvent({ type: "text", text: text.slice(0, half) });
    onEvent({ type: "text", text: text.slice(half) });
    onEvent({ type: "block-end", documents: options.cites ?? [1] });
    return {
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text },
      ],
      stopReason: options.stopReason ?? "end_turn",
      model: "claude-sonnet-4-6",
      usage: { input: 100, output: 200, cacheRead: 40_000, cacheWrite: 0 },
    };
  }) as Model & { calls: Parameters<Model>[0][] };
  fn.calls = calls;
  return fn;
}

export function deps(model: Model = stubModel(), store = new MemoryStore()): Deps & { store: MemoryStore } {
  let n = 0;
  return { store, model, corpus, now: () => new Date("2026-10-09T12:00:00Z"), newId: () => `q${++n}` };
}

export function body(question: string, history: unknown[] = [], conversationId = "conv-0001"): string {
  return JSON.stringify({ conversationId, question, history });
}

export function collect(): { events: AskEvent[]; send: (event: AskEvent) => void } {
  const events: AskEvent[] = [];
  return { events, send: (event) => events.push(event) };
}
