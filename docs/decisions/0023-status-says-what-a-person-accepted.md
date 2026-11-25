# ADR 0023: Status says what a person accepted, and delivery says what exists

**Status:** accepted, 2026-11-25 (issue #126). Proposed 2026-11-24. Part of the move to
`0.3`, with ADR 0024, ADR 0025 and ADR 0026.

## Context

`status` is `draft`, `approved`, `implemented`, `released`, `deprecated` or `retired` (Core §7). It was written before
two later fields existed:

- `delivery` (ADR 0017) says whether the work a record describes exists: `planned` or `built`.
- `approval` (ADR 0020, ADR 0022) says who approved a record, when and on what basis.

So three fields answer two questions: has a person accepted this promise, and does the code exist. The overlap is
paid for in rules a reader has to learn and a check that exists to catch the fields disagreeing:

- A record's effective delivery is inferred: its `delivery`, else `built` when its status is `implemented`, `released`
  or `deprecated` (`BUILT_STATUSES`, `deliveryOf`).
- `approved` "claims nothing about the code", so an approved record without the field is "not stated".
- CORE005 reports `delivery: planned` beside `implemented`, `released` or `deprecated`.
- `released` says a release shipped, which validation cannot know: release labels are opaque (Core §7).

Three sets in the code list the same four "past draft" statuses (`OWNED_STATUSES` in core and architecture,
`PUBLISHABLE_STATUSES` in the publisher), and none of them tells `approved` from `implemented` or `released`. No check
reads the difference except the delivery inference.

## Decision

**`status` is the review lifecycle only: `draft`, `approved`, `deprecated`, `retired`. Whether the work exists is
`delivery`, and nothing else says it.**

- `implemented` and `released` are no longer statuses. A record that declares either is CORE001, as any value outside
  the list is.
- `intentset migrate --to 0.3` rewrites each to `approved`. On a type that carries `delivery` and does not state it, it
  writes `delivery: built`, which is what the status claimed. On a type that never carries `delivery` (product,
  intent, outcome, measure, verification, knowledge, decision) it writes `approved` and nothing else.
- Effective delivery is the field, else `built` for `deprecated`, else not stated. A deprecated record describes
  something that existed; the inference stays for that one status so that deprecating a record does not require a
  second edit.
  Settled on acceptance: the inference stays, and `migrate` writes no `delivery` on a deprecated record.
- CORE005 keeps its two remaining conditions: `delivery: planned` on a `deprecated` record, and a behavior whose
  effective delivery is `built` implemented by a slice that says `planned`.
- Whether a release has shipped stays where it is: `availability.releases` names labels from the registry, and what a
  label means is the adopter's.

## Rejected

- **Keep six statuses and document the overlap.** That is today. The cost is the inference, the CORE005 condition and
  a reader's question of which field to trust.
- **Remove `delivery` and keep the statuses.** ADR 0017's reason stands: a draft written from code that exists, and an
  approved record whose work is not built, cannot be said with status alone.
- **Accept the old values as synonyms of `approved`.** Two spellings of one state, in every reader, for as long as the
  specification lives. A migration does the same work once.

## Consequences

- **Breaking**: a record that conformed with `implemented` or `released` no longer does, so this moves `intentset.spec`
  to `0.3` (Core §1) and the export, whose schema lists the statuses, to `0.7`.
- In the suite, `implemented` or `released` appears 19 times across `tests/core.json` (9), `tests/export.json` (3) and
  `tests/list.json` (7). No record under `examples/` or `product/model/` uses either.
- `list` counts by status and by delivery (ADR 0018); its selector loses two values.
- The agent guide's "Never" list shortens: an agent sets no status past `draft`, and `delivery` is the fact it may
  write.
- Not counted: how many records in adopting repositories use either status. `migrate` rewrites them.
