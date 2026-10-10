import { admit, spend } from "./admission.ts";
import type { Corpus } from "./corpus.ts";
import { getInvolvedUrl, model as modelConfig, pricePerMillion, retentionDays } from "./limits.ts";
import { errorName, errorStatus, log, metric } from "./log.ts";
import type { Model, ModelResult } from "./model.ts";
import { conversation, SYSTEM } from "./prompt.ts";
import { type AnswerBlock, parseRequest, type RequestProblem } from "./request.ts";
import { scrub } from "./scrub.ts";
import type { Outcome, Store } from "./store.ts";
import type { Refusal } from "./admission.ts";

/** What the panel receives, one JSON object per line. */
export type AskEvent =
  | { type: "text"; text: string }
  | { type: "sources"; sources: Array<{ url: string; title: string }> }
  | { type: "done"; outcome: Outcome; answer: AnswerBlock[] }
  | { type: "refused"; reason: Exclude<RequestProblem, "malformed"> | Refusal | "declined" }
  | { type: "error"; reason: "malformed" | "model" | "origin" | "internal" };

export interface Deps {
  store: Store;
  model: Model;
  corpus: Corpus;
  now: () => Date;
  newId: () => string;
}

/**
 * Answer one question (CAP-ASK): parse it, admit it, stream the model's answer with its sources, then count its cost
 * and keep it, scrubbed. Every refusal before the model costs nothing and keeps nothing (BEH-ASK-LIMITS).
 */
export async function ask(
  body: string | undefined,
  ip: string,
  deps: Deps,
  send: (event: AskEvent) => void,
): Promise<void> {
  const parsed = parseRequest(body);
  if (!parsed.ok) {
    log("ask.refused", { reason: parsed.problem });
    send(
      parsed.problem === "malformed"
        ? { type: "error", reason: "malformed" }
        : { type: "refused", reason: parsed.problem },
    );
    return;
  }
  const { request } = parsed;
  const now = deps.now();
  const admitted = await admit(deps.store, ip, now);
  if (!admitted.ok) {
    log("ask.refused", { reason: admitted.refusal });
    if (admitted.refusal === "budget") metric("BudgetRefused", 1);
    send({ type: "refused", reason: admitted.refusal });
    return;
  }

  const turn = request.history.length + 1;
  const sourcesSeen = new Set<string>();
  let result: ModelResult | null = null;
  try {
    result = await deps.model({ system: SYSTEM, messages: conversation(deps.corpus, request) }, (event) => {
      if (event.type === "text") {
        send(event);
        return;
      }
      const sources = event.documents
        .map((index) => deps.corpus.documents[index])
        .filter((doc) => doc !== undefined)
        .map((doc) => ({ url: doc.url, title: doc.title }));
      for (const source of sources) sourcesSeen.add(source.url);
      if (sources.length > 0) send({ type: "sources", sources });
    });
  } catch (error) {
    log("ask.failed", {
      conversation: request.conversationId,
      turn,
      error: errorName(error),
      status: errorStatus(error),
    });
    send({ type: "error", reason: "model" });
  }

  const text = result ? answerText(result.content) : "";
  const outcome: Outcome = !result
    ? "failed"
    : result.stopReason === "refusal"
      ? "refused-by-model"
      : text.includes(getInvolvedUrl)
        ? "contact"
        : sourcesSeen.size > 0
          ? "answered"
          : "uncited";
  if (result) {
    if (outcome === "refused-by-model") send({ type: "refused", reason: "declined" });
    else send({ type: "done", outcome, answer: result.content });
  }

  const usage = result?.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const costMicros =
    usage.input * pricePerMillion.input +
    usage.output * pricePerMillion.output +
    usage.cacheWrite * pricePerMillion.cacheWrite +
    usage.cacheRead * pricePerMillion.cacheRead;
  log("ask.answered", {
    conversation: request.conversationId,
    turn,
    outcome,
    model: result?.model,
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    costMicros: Math.ceil(costMicros),
  });
  metric("CostMicros", Math.ceil(costMicros), "None");
  try {
    await spend(deps.store, costMicros, now);
    await deps.store.putQuestion({
      id: deps.newId(),
      askedAt: now.toISOString(),
      conversationId: request.conversationId,
      turn,
      question: scrub(request.question),
      answer: scrub(text),
      outcome,
      sources: [...sourcesSeen].sort(),
      contact: outcome === "contact",
      model: result?.model ?? modelConfig.id,
      corpusHash: deps.corpus.hash,
      corpusVersion: deps.corpus.version,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      costMicros: Math.ceil(costMicros),
      expiresAt: Math.floor(now.getTime() / 1000) + retentionDays * 86_400,
    });
  } catch (error) {
    log("ask.store-failed", { conversation: request.conversationId, turn, error: errorName(error) });
  }
}

function answerText(content: AnswerBlock[]): string {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}
