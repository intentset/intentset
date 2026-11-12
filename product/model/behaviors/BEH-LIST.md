---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-LIST
  type: behavior
  title: List gives the records that match a selector, and says what it could not decide
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
  parent: CAP-AGENT-CONTEXT
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC, RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# List gives the records that match a selector, and says what it could not decide

## Behavior

Someone, or an agent, runs `intentset list` with options that name fields (type, status, delivery, owner, audience, visibility, an ancestor, availability, an extension, a link with a quantifier, the slice a record describes, a path a slice claims), or gives the same selector as JSON with `--where`, and gets the records that match, from the repository's tree or from an export with `--from`. The fields combine with AND and the values of one field with OR, matching is exact, and a link predicate looks one hop (spec/list.md §1). `describing` and `claims` use the definitions `review` and `context` use, which core now holds, so a consumer that calls `select` no longer copies them. The result is a table, the `intentset/list/0.1` JSON, or the matched IDs, and names its snapshot, the validation's status and totals, the normalized selector, and the counts considered, withheld, matched and undetermined, with `--count-by` counting the matches by one field. `--count-by delivery` groups by the effective delivery, `unstated` by name, so each group's count is what `--delivery` with that value lists (ADR 0017). The command never writes.

## Preconditions

A repository with `.intentset/config.yaml`, or an export a consumer's reading accepts (spec/export.md §5). Restricted records are withheld from the tree unless `--include-restricted`, as an export withholds them.

## Outcomes

Success: the matched records, sorted by ID, the same bytes for the same input; a record whose answer depends on a link to a withheld record is undetermined and listed apart, never as a match or a miss; a value no registry holds matches nothing and the result says so. It exits 0 whenever it answered, a failed validation included, which the result names; with `--check` it exits 1 when any record matched or is undetermined. Failure: an unknown option or selector key, a value outside a closed set, an empty list, a `*` that is not trailing, a link predicate that looks past one hop, an export the reader rejects, or `--where` beside a field option is an invocation error, exit 2, and nothing is read.

## Sources

- `spec/list.md`, ADR 0016, and ADR 0017 for `--delivery`.
- The CLI's usage, `intentset --help`.
