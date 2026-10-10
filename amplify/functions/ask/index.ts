import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { type AskEvent, ask, type Deps } from "./answer.ts";
import corpusFile from "./corpus.json" with { type: "json" };
import { checkCorpus } from "./corpus.ts";
import { errorName, log } from "./log.ts";
import { bedrockModel } from "./model.ts";
import { DynamoStore } from "./store.ts";

/**
 * The chat's function (SLICE-ASK's entrypoint): `POST /ask` through API Gateway, streamed. The answer goes back as
 * newline-delimited JSON, one AskEvent per line, as it is written. Only the origins in ASK_ALLOWED_ORIGINS get a CORS
 * header; anything else is answered 403 without reading the body.
 */
const allowedOrigins = (process.env.ASK_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

let deps: Deps | null = null;
function dependencies(): Deps {
  deps ??= {
    store: new DynamoStore(required("ASK_LIMITS_TABLE"), required("ASK_QUESTIONS_TABLE")),
    model: bedrockModel(),
    corpus: checkCorpus(corpusFile),
    now: () => new Date(),
    newId: randomUUID,
  };
  return deps;
}

export const handler = awslambda.streamifyResponse(async (event: APIGatewayProxyEvent, responseStream) => {
  const origin = event.headers?.origin ?? event.headers?.Origin ?? "";
  const allowed = allowedOrigins.includes(origin);
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: allowed ? 200 : 403,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      ...(allowed ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    },
  });
  const send = (e: AskEvent) => stream.write(`${JSON.stringify(e)}\n`);
  if (allowed) {
    try {
      await ask(event.body ?? undefined, event.requestContext?.identity?.sourceIp ?? "unknown", dependencies(), send);
    } catch (error) {
      // A store that could not be reached, before or after the model: the panel is told, rather than left waiting.
      log("ask.error", { error: errorName(error) });
      send({ type: "error", reason: "internal" });
    }
  } else {
    // A streamed response with no body is a 502 at API Gateway, so the refusal says something.
    send({ type: "error", reason: "origin" });
  }
  stream.end();
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
