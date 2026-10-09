import { limits } from "./limits.ts";

/**
 * What the panel sends: the question, and the conversation so far, which the browser keeps (nothing of it is kept on
 * the server between questions). Each earlier answer is sent back exactly as the `done` event gave it, because the
 * model's own blocks have to be returned unchanged to continue the conversation.
 */
export interface AskRequest {
  conversationId: string;
  question: string;
  history: Array<{ question: string; answer: AnswerBlock[] }>;
}

/** A block of an earlier answer: text, or the model's thinking or fallback blocks, passed back as they came. */
export type AnswerBlock = { type: string; [field: string]: unknown };

/** Why a request was refused before any model call (BEH-ASK-LIMITS), or that it was malformed. */
export type RequestProblem = "malformed" | "too-long" | "too-many-turns";

const ANSWER_BLOCK_TYPES = new Set(["text", "thinking", "redacted_thinking", "fallback"]);
const CONVERSATION_ID = /^[A-Za-z0-9-]{8,64}$/;

export function parseRequest(
  body: string | null | undefined,
): { ok: true; request: AskRequest } | { ok: false; problem: RequestProblem } {
  if (typeof body !== "string" || body.length === 0) return { ok: false, problem: "malformed" };
  if (Buffer.byteLength(body, "utf8") > limits.requestBytes) return { ok: false, problem: "too-long" };
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, problem: "malformed" };
  }
  if (!isObject(value)) return { ok: false, problem: "malformed" };
  const { conversationId, question, history = [] } = value;
  if (typeof conversationId !== "string" || !CONVERSATION_ID.test(conversationId))
    return { ok: false, problem: "malformed" };
  if (typeof question !== "string" || question.trim() === "") return { ok: false, problem: "malformed" };
  if (question.length > limits.questionChars) return { ok: false, problem: "too-long" };
  if (!Array.isArray(history)) return { ok: false, problem: "malformed" };
  if (history.length + 1 > limits.turns) return { ok: false, problem: "too-many-turns" };
  const turns: AskRequest["history"] = [];
  for (const turn of history) {
    if (!isObject(turn) || typeof turn.question !== "string" || !Array.isArray(turn.answer)) {
      return { ok: false, problem: "malformed" };
    }
    if (turn.question.length > limits.questionChars) return { ok: false, problem: "too-long" };
    const answer: AnswerBlock[] = [];
    for (const block of turn.answer) {
      if (!isObject(block) || typeof block.type !== "string" || !ANSWER_BLOCK_TYPES.has(block.type)) {
        return { ok: false, problem: "malformed" };
      }
      answer.push(block as AnswerBlock);
    }
    if (!answer.some((block) => block.type === "text")) return { ok: false, problem: "malformed" };
    turns.push({ question: turn.question, answer });
  }
  return { ok: true, request: { conversationId, question: question.trim(), history: turns } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
