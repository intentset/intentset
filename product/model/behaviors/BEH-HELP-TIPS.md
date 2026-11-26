---
markset: true
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-HELP-TIPS
  type: behavior
  title: Tips are bound to the controls that deliver a behavior
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
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

A product's interface reads the help file with `readHelp` and calls `bindTips`, which puts each published tip on the controls marked with its behavior ID, in one pass. By default it sets `data-help-tip` to the tip's text and `data-help-knowledge` to the knowledge ID, and nothing a browser displays: the product shows the tip, as a visible tooltip and an accessible description, through its own `render`.

## Preconditions

A help file written by publication, and controls marked `data-behavior="BEH-..."` by default.

## Outcomes

Success: the tips are bound and the binder reports what was bound and what had no tip. The default render sets no `title` and leaves one the control already has as it was. Failure: a help file with any problem is refused whole.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
