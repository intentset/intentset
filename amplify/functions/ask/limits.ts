/**
 * The chat's limits and periods (RULE-ASK-SPEND-CAPPED, RULE-ASK-RETENTION, RULE-ASK-NO-IDENTITY). One place, so the
 * function, the backend and the privacy page read the same numbers; a changed retention period changes the privacy
 * page in the same commit, and a test holds the two together.
 */
export const limits = {
  /** Characters in one question. */
  questionChars: 1_000,
  /** Questions in one conversation, the current one included. */
  turns: 12,
  /** Bytes in one request body: the question and the conversation so far. */
  requestBytes: 256 * 1024,
  /** Questions one visitor may ask in a UTC day. */
  visitorPerDay: 40,
  /** What the chat may spend in a UTC day, in US dollars, estimated from token counts. */
  dailyBudgetUsd: 5,
  /** Output tokens for one answer, thinking included. */
  answerTokens: 4_096,
  /** Answers being written at once; the function's reserved concurrency. */
  concurrency: 5,
  /** Seconds one answer may take. */
  timeoutSeconds: 120,
  /** Requests per IP per five minutes before the web application firewall blocks. */
  wafPerFiveMinutes: 100,
} as const;

/** How long a stored question and its answer are kept. The privacy page quotes it. */
export const retentionDays = 90;

/** How long the per-visitor counter, keyed on a salted hash of the IP address, and the day's salt are kept. */
export const visitorHashHours = 48;

/**
 * Estimated prices per million tokens, in US dollars, for the daily budget only. They are Anthropic's published rates
 * for Claude Opus 5.5 (cache writes at the 1-hour rate); Bedrock bills its own, and the AWS bill is the measure.
 */
export const pricePerMillion = { input: 4, output: 20, cacheWrite: 8, cacheRead: 0.2 } as const;

/** The model: Claude Opus 5.5 through the US cross-region inference profile, at low effort. */
export const model = {
  id: "us.anthropic.claude-opus-5-5",
  /** Used only when Opus 5.5 declines a request on a safety ground. */
  fallbackId: "us.anthropic.claude-opus-4-8",
  effort: "low",
  region: "us-east-2",
} as const;

/** Where a visitor who wants to get in touch is sent (BEH-ASK-CONTACT). */
export const getInvolvedUrl = "https://coralreefventures.com/get-involved/";
