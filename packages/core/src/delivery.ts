/**
 * Core §7, ADR 0017: a record's effective delivery. Its `delivery` when it states one; otherwise `built` when its
 * status claims an implementation (`implemented`, `released`, `deprecated`); otherwise null, not stated. `approved`
 * claims nothing about the code, so an approved record without the field is not stated.
 */
import { BUILT_STATUSES, type Delivery, type Status } from "./types.ts";

export function deliveryOf(meta: { delivery?: Delivery | null; status: Status }): Delivery | null {
  if (meta.delivery !== undefined && meta.delivery !== null) return meta.delivery;
  return (BUILT_STATUSES as readonly string[]).includes(meta.status) ? "built" : null;
}
