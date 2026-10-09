import { defineFunction } from "@aws-amplify/backend";
import { limits } from "./limits.ts";

/**
 * ask: the chat's function (SLICE-ASK). Reached only through the API Gateway API that backend.ts puts behind the
 * regional web application firewall; it has no function URL. Its reserved concurrency, set in backend.ts, is its
 * ceiling and its guarantee.
 */
export const ask = defineFunction({
  name: "intentset-ask",
  entry: "./index.ts",
  runtime: 24,
  timeoutSeconds: limits.timeoutSeconds,
  memoryMB: 512,
  logging: { format: "json", retention: "1 month" },
});
