/**
 * The slice helpers `review` and `context` use. They moved to `@intentset/core` in 0.11.0 (ADR 0016), where `select`
 * shares them; the CLI re-exports them for one release, and from 0.12.0 a consumer imports them from core.
 */
export { activeSlices, claimingSlices, describingRecords, isSliceCode } from "@intentset/core";
