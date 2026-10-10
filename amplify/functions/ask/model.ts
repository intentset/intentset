import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { betaRefusalFallbackMiddleware } from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { limits, model } from "./limits.ts";
import type { AnswerBlock } from "./request.ts";

/** What the answer streams while it is written. */
export type ModelEvent =
  | { type: "text"; text: string }
  /** A text block ended; these are the corpus documents its citations point at. */
  | { type: "block-end"; documents: number[] };

export interface ModelResult {
  /** The answer's blocks, exactly as the model returned them, to be sent back with the next question. */
  content: AnswerBlock[];
  stopReason: string | null;
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export type Model = (
  request: { system: string; messages: BetaMessageParam[] },
  onEvent: (event: ModelEvent) => void,
) => Promise<ModelResult>;

/**
 * The model in limits.ts on Bedrock, through the US cross-region inference profile, at low effort, streaming. When it
 * has a fallback and declines on a safety ground, the SDK's refusal-fallback middleware retries on the fallback inside
 * the same stream; the answer then carries a `fallback` block, which goes back with the next question like any other.
 */
export function bedrockModel(): Model {
  const client = new AnthropicBedrock({
    awsRegion: model.region,
    // The SDK's timeout covers the wait for the response to start; a timed-out attempt is retried once.
    timeout: limits.modelWaitSeconds * 1000,
    maxRetries: 1,
    middleware: model.fallbackId ? [betaRefusalFallbackMiddleware([{ model: model.fallbackId }])] : [],
  });
  return async ({ system, messages }, onEvent) => {
    const stream = client.beta.messages.stream({
      model: model.id,
      max_tokens: limits.answerTokens,
      output_config: { effort: model.effort },
      system,
      messages,
    });
    // Once the response has started, a pause longer than modelWaitSeconds ends the attempt: the stream is aborted and
    // the answer fails, rather than waiting out the function's timeout. Before it starts, the SDK's own timeout and
    // retry apply, so the first wait allows for both.
    let idle: ReturnType<typeof setTimeout> | undefined;
    const wait = (seconds: number) => {
      clearTimeout(idle);
      idle = setTimeout(() => stream.abort(), seconds * 1000);
    };
    wait(limits.modelWaitSeconds * 2 + 5);
    const cited = new Map<number, Set<number>>();
    const textBlocks = new Set<number>();
    try {
      for await (const event of stream) {
        wait(limits.modelWaitSeconds);
        if (event.type === "content_block_start" && event.content_block.type === "text") textBlocks.add(event.index);
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") onEvent({ type: "text", text: event.delta.text });
          if (event.delta.type === "citations_delta" && "document_index" in event.delta.citation) {
            const set = cited.get(event.index) ?? new Set<number>();
            set.add(event.delta.citation.document_index);
            cited.set(event.index, set);
          }
        }
        if (event.type === "content_block_stop" && textBlocks.has(event.index)) {
          onEvent({ type: "block-end", documents: [...(cited.get(event.index) ?? [])].sort((a, b) => a - b) });
        }
      }
    } finally {
      clearTimeout(idle);
    }
    const final = await stream.finalMessage();
    return {
      content: final.content as unknown as AnswerBlock[],
      stopReason: final.stop_reason,
      model: final.model,
      usage: {
        input: final.usage.input_tokens,
        output: final.usage.output_tokens,
        cacheRead: final.usage.cache_read_input_tokens ?? 0,
        cacheWrite: final.usage.cache_creation_input_tokens ?? 0,
      },
    };
  };
}
