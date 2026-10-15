---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ATLAS
  type: behavior
  title: Atlas renders review pages over an export
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-REVIEW-VIEWS
  links:
    governedBy: [RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Atlas renders review pages over an export

## Behavior

Someone runs `intentset serve` and gets the Atlas, the internal review pages over the model's export, served locally and rebuilt when a file changes, or written to `--out`: the model, its reports and each artifact, with the snapshot each page describes. Every page opens with a notice that it may hold internal and restricted records and is not for publication. The one exception is an invented example's Atlas, asked for from the library with the `example` notice: its pages say the product is invented and that a team's own Atlas stays internal, which is how intentset.org shows the worked example's.

## Preconditions

A configured repository; run records for the evidence pages.

## Outcomes

Success: the pages. Failure: an invocation the command cannot run exits 2 and serves nothing.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
