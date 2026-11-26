/** Failed sign-in attempts in a row that lock an account (RULE-SIGN-IN-LOCKOUT). */
export const MAX_FAILED_ATTEMPTS = 5;

/** How long a locked account refuses to sign in, even with the right password. */
export const LOCKOUT_MS = 15 * 60 * 1000;

/** Whether an account refuses to sign in at `now`, given the times of its failed attempts in a row. */
export function isLockedOut(failedAt: readonly number[], now: number): boolean {
  if (failedAt.length < MAX_FAILED_ATTEMPTS) return false;
  return now - failedAt[failedAt.length - 1] < LOCKOUT_MS;
}
