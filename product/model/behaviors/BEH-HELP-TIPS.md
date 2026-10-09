---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-HELP-TIPS
  type: behavior
  title: Tips are bound to the controls that deliver a behavior
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-PUBLISH
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Tips are bound to the controls that deliver a behavior

## Behavior

A product's interface reads the help file with `readHelp` and calls `bindTips`, which puts each published tip on the controls marked with its behavior ID.

## Preconditions

A help file written by publication, and controls marked `data-behavior="BEH-..."` by default.

## Outcomes

Success: the tips are bound and the binder reports what was bound and what had no tip. Failure: a help file with any problem is refused whole.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
