/**
 * The backend's settings, which differ between the branch (what intentset.org calls) and an agent's sandbox. Read at
 * synth, from the context Amplify sets, so a sandbox can never answer intentset.org and the branch never answers a
 * local server.
 */
export const SITE_ORIGIN = "https://intentset.org";
/** `pnpm run site:watch` serves here by default (site/serve.ts). */
export const LOCAL_ORIGIN = "http://localhost:3004";

export function allowedOrigins(branch: boolean): string[] {
  return branch ? [SITE_ORIGIN] : [LOCAL_ORIGIN];
}
