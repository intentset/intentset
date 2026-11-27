---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-HELP-TIPS
  type: behavior
  title: Tips are bound to the controls that deliver a behavior
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
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

A product's interface reads the help file with `readHelp` and calls `bindTips`, which puts each published tip on the controls marked with its behavior ID, in one pass. By default it sets `data-help-tip` to the tip's text and `data-help-knowledge` to the knowledge ID, and nothing a browser displays: the product shows the tip, as a visible tooltip and an accessible description, through its own `render`. A file may hold help kept under review (ADR 0027): a knowledge entry and its tips marked `underReview: true`, with the knowledge's path under `under-review/`, and rule IDs whose tips were held back, in `withheldForReview`. Every reader leaves help under review out unless it is given `underReviewHelp: "include"`, and lists the control ID in `pendingReview`, never in `missing`, in either mode; under `include` the default render also sets `data-help-under-review="true"` and removes nothing. `reviewStateFor` says `current`, `under-review`, `held-back` or `none` for a control, and `articles` lists the file's articles, honouring the option.

## Preconditions

A help file written by publication, and controls marked `data-behavior="BEH-..."` by default.

## Outcomes

Success: the tips are bound and the binder reports what was bound, what had no tip and what is pending review. The default render sets no `title` and leaves one the control already has as it was. Failure: a help file with any problem is refused whole, a mark that is not `true`, a tip and its knowledge entry disagreeing on the mark, a marked entry outside `under-review/`, or a `withheldForReview` ID that is also a tip's key among them.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
