/**
 * The pattern language of `.intentset/config.yaml` scope and ignore lists and of slice claims (VSA §3). It moved to
 * `@intentset/core` in 0.11.0 with the slice helpers that use it (ADR 0016), and the CLI re-exports it, so
 * `matchGlob` and `matchAny` stay on its public surface.
 */
export { matchAny, matchGlob } from "@intentset/core";
