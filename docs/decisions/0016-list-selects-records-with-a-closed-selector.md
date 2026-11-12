# ADR 0016: `intentset list` selects records with a closed selector

**Status:** accepted, 2026-11-11

## Context

Intentset could not answer "which records match these conditions". No command filtered records: `graph --release`
checks its argument and copies it into the envelope, and filters nothing. The MCP server's `intentset_search` filters by
type only and returns at most 20 results. The Atlas's Records page has no owner column and no filter.

So each adopter wrote its own joins. The design partner whose questions drove this keeps about 2,100 lines across seven
scripts that answer them, with four separate readers of the export, three definitions of the product a record belongs
to, and a copy of the CLI's internal `describingRecords`, the Core §10 definition of the records that describe a slice.
A screen of their own is theirs to keep. A copied definition is not: when Intentset changes its definition, the copy
drifts and nothing reports it.

ADR 0012 said that Intentset does not "run a query", and `docs/implementation-plan.md` left the consumers "their read
models". Both were written about other things (outcome telemetry, and the screens a consumer builds over an export),
and both read as if selecting records were the consumers' business.

## Decision

- **One selector, in `@intentset/core`, and a read-only `intentset list` on it.** `readSelector(value)` reads and
  normalizes a selector; `select(graphOrCheckedExport, selector)` answers it; `listOutput` wraps the answer in the
  versioned result. The MCP tools, the Atlas pages and consumers' scripts are to reuse the same function. The command
  is named `list`, not `query`: it lists records of the model and computes nothing about the product.
- **The selector is data, not a language** (spec/list.md §1). A command line's flags compile to it, and a JSON file
  given with `--where` holds it. Its fields combine with AND and the values within one field with OR, the rule Core §7
  already sets for availability. Matching is exact; the one pattern is a trailing `*` on an ID. An unknown key is an
  error, exit 2, never ignored. There is no grammar to parse, no regex, no comparison operator, no user-chosen sort
  order and no percentage, and no dependency for any of them (design invariant 8).
- **A link predicate looks one hop.** `{direction, kind, quantifier, match}` with `some`, `none` or `all`: the far end
  is matched on its own fields, never on its links, `describing` or `claims`, and a selector that tries is rejected.
  Deeper nesting is a later decision (the recommendation's phase 2), made when an adopter's question needs it.
- **Both sources are read through the export's projection.** A list from the tree withholds restricted artifacts unless
  `--include-restricted`, exactly as `graph` does, and a list from an export (`--from`, read through `readExport`, with
  no repository I/O) reads what the export carries. So the tree and its export give the same answer, which the
  conformance driver checks on every case.
- **What the source withheld is undetermined, never a match and never a miss.** Where the answer for a visible record
  depends on a link end the source withheld, the record is counted and listed as undetermined (design invariant 6).
  `--check` exits 1 for a match or an undetermined record, so a gate never reads "could not tell" as a pass.
- **Intentset's definitions move into core.** `describingRecords`, `claimingSlices`, `activeSlices` and `isSliceCode`
  move from the CLI to core, with `matchGlob` and `matchAny`, so `describing` and `claims` in a selector are the Core
  §10 definitions `review` and `context` use. The CLI re-exports them for 0.11; from 0.12 a consumer imports them from
  core.
- **The result names what it was read from** (`intentset/list/0.1`, spec/list.md §5): the snapshot, the validation
  totals, the normalized selector, and the counts considered, withheld, matched and undetermined. A field the source
  does not carry reads `not-supplied`, never null or empty. Exit 0 whenever it answered, a failed validation included,
  because the result says so; 1 only with `--check`; 2 for an invocation error.
- **`list` joins the read-only commands.** Design invariant 7 and RULE-READ-ONLY-CHECKS name it: it runs no code from
  the repository, opens no network connection and writes nothing.
- **Two earlier sentences are narrowed, not withdrawn.** ADR 0012's "run a query" is about outcome telemetry, and the
  implementation plan's "read models" are the consumers' screens. Consumers keep their screens, their read models and
  their rules; they stop re-deriving Core §5 and §10's definitions, and select through core instead.

What `list` does not do, on purpose: filter the export (`graph` never writes a short export that could read as a
complete one), infer an order between release labels or compute "first shipped in" (labels are opaque, Core §7),
filter in the Atlas's browser, give customer-mode MCP a query tool, keep an index, a daemon or saved queries, or write
anything.

## Consequences

- A consumer's question about drafts, owners, releases, links or slices is one command, or one call to `select`, and
  the answer names its snapshot and denominators.
- A record "new in pilot-2" is written as `--release pilot-2 --not-release pilot-1`: exact matching keeps release labels
  opaque, and the note on every availability selection says that status and availability are authored claims.
- `tests/list.json` is a sixth conformance section, with `selector`, `countBy` and `list` as new optional case fields.
  No existing case changed, so `intentset.spec` does not move. `spec/list.md` versions its result separately, as the
  export does.
- Undetermined is conservative: an export says how many of a record's link ends it withheld, not of which kind, so a
  record whose type allows a withheld end of the kind asked about is undetermined unless its visible ends already
  decide.
- The selector can grow fields (the recommendation's phase 2: a derived product reach, ancestors, sections) without
  breaking a selector written today, since a new field is new and an unknown one was always an error.
- Phase 4's review fields: the export does not carry `reviewedBy` and `reviewedAt` yet, so a list from an export
  reads them as `not-supplied`, and a list from the tree reads them from the records.
