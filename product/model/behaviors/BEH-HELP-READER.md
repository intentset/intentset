---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-HELP-READER
  type: behavior
  title: A help file is served only to a reader who holds everything it names
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-PUBLISH
  links:
    governedBy: [RULE-FAIL-CLOSED]
  formalizes:
    - source: https://github.com/intentset/intentset/issues/144
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A help file is served only to a reader who holds everything it names

## Behavior

A product checks a help file, or a document's publication block, against the person it would serve with `servedTo(file, reader)` from `@intentset/help`, and `readHelp` reads the file's audiences, roles and flags as sorted lists in a file whose every object is closed (publication §5, ADR 0029).

## Preconditions

A help file written by a 0.3 publisher, and a reader described by the visibilities they are cleared for, their audiences, roles and flags, and the product, release and edition they are on.

## Outcomes

Success: `servedTo` is true for a reader cleared for the file's projection who holds every audience, role and flag it names, on the same product, release and edition, however much more they hold. Failure: it is false when any one audience, role or flag is missing, any single value differs, or the projection is not among the reader's visibilities; `readHelp` refuses, whole, a file whose lists are not sorted and unique, whose audience or roles are empty, that lacks a member of the table, or that holds a member the table does not give it at the top, in `availability`, in a `knowledge` entry or in a tip.
