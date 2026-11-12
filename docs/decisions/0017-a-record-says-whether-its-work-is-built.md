# ADR 0017: A record says whether its work is built, apart from its approval

**Status:** accepted, 2026-11-12

## Context

Core §7 already keeps "agreed" apart from "built": `approved` records intent, and `implemented` records an
implementation claim. But status is one ordered axis, so it cannot say "this describes code that exists, and nobody
has approved it yet". The adoption guide's own flow creates hundreds of such records: an adopter writes records from
an existing codebase, as drafts, for owners to review. Each one looks exactly like a draft that proposes work nobody
has started.

The design partner found this in its own model on 2026-11-12. It has several hundred drafts, and a draft there means
four different things:

1. a proposal for work that is not built;
2. a record of built code, written during adoption and waiting for an owner;
3. a record returned to draft, such as knowledge pulled back because its product was not approved;
4. a draft by rule, such as a product slice with no behaviors, or a measure written for its owner to confirm.

Nothing in the model tells (1) from (2). The partner marks proposals in prose, and a page it generates lists every
draft capability as planned, so built but unreviewed work shows as planned. Release labels do not help: one label for
work not yet shipped covers both drafts and approved behaviors that are built.

Part of the fix is the partner's, which reads `approved` as built and uses neither `implemented` nor `released`. The
rest is Intentset's, because the lifecycle cannot state case (2) at all.

## Decision

**An optional `delivery` field states whether the work a record describes exists: `planned` or `built`** (Core §7).
It goes on the records that describe work code delivers: capability, behavior, rule, scenario, slice and contract.
On any other type it is CORE001, as `measure` and `tips` are. When it is absent, delivery is not stated.

- **It is a statement about the code, not about approval.** Whoever writes the record sets it when it is true, an
  agent included: `built` on a record written from code that exists, `planned` on one that proposes work, and
  `planned` changed to `built` by the change that builds it. Approval stays a person's. An agent still never sets
  `approved`, `implemented` or `released`.
- **Status still speaks first.** A record's effective delivery is its `delivery` when present, otherwise `built` for
  `implemented`, `released` and `deprecated`, since each of those claims an implementation, and otherwise not stated.
  `approved` claims nothing about the code, so an approved record without the field is not stated.
- **`validate` reports contradictions** (CORE005, an error). `delivery: planned` on an `implemented`, `released` or
  `deprecated` record contradicts its status. A behavior whose effective delivery is `built`, implemented by a slice
  whose `delivery` is `planned`, contradicts the slice.
- **Built work is held to what exists** (VSA §3, at L2). A draft slice's missing claim (VSA009) and missing
  entrypoint (VSA002) are warnings, because its paths may be planned. A draft slice whose effective delivery is
  `built`, or that implements a behavior whose effective delivery is `built`, has no planned paths: both are errors.
  A built draft behavior that no slice implements is a VSA001 warning, so built code nobody owns is visible before
  anyone approves it.
- **Publication does not present planned work as current** (publication §4). Knowledge that explains a record whose
  `delivery` is `planned` is excluded, with the reason `planned`. Core §7 already allows prospective documentation only
  in a separately labeled roadmap projection, which v0.2 does not define.
- **`intentset list` selects it.** The new selector field `deliveries` takes `planned`, `built` and `unstated`, and it
  matches the effective delivery, and `--delivery` compiles to it. The list result stays `intentset/list/0.1`: a row
  does not carry delivery, and `--count-by` does not group by it.
- **The export carries it, so the export moves to 0.5** (export §7). The export's artifact is closed, so a 0.4 reader
  would reject an artifact that carries `delivery`. Each artifact carries the authored value, or null. A 0.5 reader
  rejects 0.4, as each earlier move did.
- **The Atlas shows it**, on the overview and on each record's page, as built, planned or not stated, and next to
  the status, never in place of it.

A new optional field changes no existing conformance case, so `intentset.spec` stays `0.2` (Core §1).

## Options rejected

- **Claim `implemented` before `approved`.** `implemented` then no longer implies `approved`, and the lifecycle
  becomes two axes written in one field. Publication excludes only `draft` and `retired`, so an unreviewed record
  would be published as soon as someone wrote `implemented` on it, which design invariant 4 forbids. It would also
  make an approved, implemented or released behavior need exactly one accountable slice (Core §5) before anyone had
  reviewed the record. And agents may not set `implemented`, so the adoption that writes the records could not mark
  them.
- **A `proposed` status before `draft`.** It is the same single axis with one more step. Draft would still mean
  three things (cases 2 to 4). An approved record could not say whether its work exists. And a new status value
  changes the export's status enum, so it costs a contract move just as the field does.
- **Nothing new: adopters use `implemented` with a review note.** Agents may not set `implemented`, and the adoption
  is done by an agent. It would also publish unreviewed records, as the first option would.
- **`origin: proposed | as-built`, a provenance field.** It records how the record was written, which never changes,
  while the reader's question is whether the work exists now. A proposal built while still in draft would say
  `proposed` for good.
- **A boolean `built`.** A list of strings reads the same in the selector as every other field, and leaves room for a
  third value if one is ever needed (a record of partly built work should be split, so `partial` is not added).

## Not judged

- **A planned record that names a shipped release.** Release labels are opaque (Core §7), and the release registry
  does not say which labels have shipped, so Intentset cannot tell a real release from a placeholder such as
  `unreleased`. `delivery: planned` with status `released` is still CORE005.
- **A capability whose delivery disagrees with its behaviors.** A capability that is built while one of its behaviors
  is planned is ordinary: work in progress under an ability that exists.

## Consequences

- An adoption marks every record it writes from code as `delivery: built`, and a proposal as `delivery: planned`. An
  owner working through drafts can ask `intentset list --status draft --delivery built` for the records that describe
  existing code.
- A generated overview reads the effective delivery: `built` means the code exists, whatever the approval, and
  `planned` means it does not. A consumer of an export applies the same rule, because the export carries the authored
  value.
- Consumers of the export (Streamlane, Driftline) move their reader to 0.5 when they update.
- Changing `planned` to `built` changes a record's source hash, so knowledge that pins it needs review again, which
  is what a reader of that knowledge would want.
