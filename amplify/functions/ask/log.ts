/**
 * The one way the chat logs: an event kind, ids, a status and counts, as one JSON line (RULE-ASK-NO-IDENTITY). A
 * question, an answer or an address never reaches a log: a string that is not a plain word or id is replaced, so a
 * mistake here cannot leak one, and a test runs a whole answer and fails if any of its text reaches the console.
 */
export type LogFields = Record<string, string | number | boolean | undefined>;

const word = /^[\w.:-]{0,80}$/;

export function log(kind: string, fields: LogFields = {}): void {
  const safe: LogFields = {};
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    safe[name] = typeof value === "string" && !word.test(value) ? "[redacted]" : value;
  }
  console.log(JSON.stringify({ kind, ...safe }));
}

/** An error's name, which is safe to log where its message may not be. */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/** An API error's HTTP status, when it has one: a number, so safe to log. */
export function errorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/** The namespace the chat's metrics are in. */
export const METRIC_NAMESPACE = "Intentset/Chat";

/**
 * A metric in CloudWatch's embedded metric format: the log line becomes a metric with no dimensions beyond the
 * function, and carries a number only.
 */
export function metric(name: string, value: number, unit: "Count" | "None" = "Count"): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [{ Namespace: METRIC_NAMESPACE, Dimensions: [[]], Metrics: [{ Name: name, Unit: unit }] }],
      },
      [name]: value,
    }),
  );
}
