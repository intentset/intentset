/** How long a password reset link works after it is sent (RULE-RESET-LINK-EXPIRY). */
export const LINK_LIFETIME_MS = 60 * 60 * 1000;

/** Whether a link sent at `sentAt` still works at `now`. */
export function linkIsValid(sentAt: number, now: number): boolean {
  return now - sentAt < LINK_LIFETIME_MS;
}
