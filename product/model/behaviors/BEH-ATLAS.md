---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ATLAS
  type: behavior
  title: Atlas renders review pages over an export
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
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

Someone runs `intentset serve` and gets the Atlas, the internal review pages over the model's export, served locally and rebuilt when a file changes, or written to `--out`: the model, its reports and each artifact, with the snapshot each page describes.

## Preconditions

A configured repository; run records for the evidence pages.

## Outcomes

Success: the pages. Failure: an invocation the command cannot run exits 2 and serves nothing.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
