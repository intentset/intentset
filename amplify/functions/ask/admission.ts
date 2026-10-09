import { createHash, randomBytes } from "node:crypto";
import { limits, visitorHashHours } from "./limits.ts";
import type { Store } from "./store.ts";

/** Why a question was refused before any model call (BEH-ASK-LIMITS). */
export type Refusal = "off" | "budget" | "visitor-limit";

/** The UTC day, which the counters and the salt are kept per. */
export function day(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function expiry(now: Date, hours: number): number {
  return Math.floor(now.getTime() / 1000) + hours * 3600;
}

/**
 * Admit a question or say why not, in the order that costs least: the switch, the day's budget, then the visitor's
 * count. The visitor is a salted hash of the IP address; the salt is random per day and kept as long as the counter, so
 * once both expire no hash can be tied to an address again (RULE-ASK-NO-IDENTITY).
 */
export async function admit(
  store: Store,
  ip: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; refusal: Refusal }> {
  const today = day(now);
  if ((await store.get("switch"))?.state === "off") return { ok: false, refusal: "off" };
  const spent = Number((await store.get(`budget#${today}`))?.value ?? 0);
  if (spent >= limits.dailyBudgetUsd * 1_000_000) return { ok: false, refusal: "budget" };
  const expiresAt = expiry(now, visitorHashHours);
  const salt = String(
    (await store.putIfAbsent(`salt#${today}`, { salt: randomBytes(32).toString("hex"), expiresAt })).salt,
  );
  const visitor = createHash("sha256").update(`${salt}:${ip}`).digest("hex");
  const counted = await store.increment(`visitor#${today}#${visitor}`, 1, limits.visitorPerDay, expiresAt);
  return counted.ok ? { ok: true } : { ok: false, refusal: "visitor-limit" };
}

/** Add an answer's estimated cost to the day's spend. */
export async function spend(store: Store, costMicros: number, now: Date): Promise<void> {
  if (costMicros <= 0) return;
  await store.increment(`budget#${day(now)}`, Math.ceil(costMicros), null, expiry(now, visitorHashHours));
}
