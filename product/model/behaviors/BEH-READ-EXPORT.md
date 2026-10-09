---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-READ-EXPORT
  type: behavior
  title: A consumer refuses an export that breaks the contract
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-EXPORT
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A consumer refuses an export that breaks the contract

## Behavior

A tool reads an export with `readExport` from `@intentset/core`, which applies the consumer's checks of spec/export.md §5.

## Preconditions

The export text, bytes or value, and optionally the repository and product the consumer expects.

## Outcomes

Success: the envelope, with what was supplied. Failure: a category and the problems; nothing of a refused export is returned.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
