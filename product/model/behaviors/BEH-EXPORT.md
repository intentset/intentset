---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-EXPORT
  type: behavior
  title: Graph prints the model as the export envelope
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-EXPORT
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Graph prints the model as the export envelope

## Behavior

Someone runs `intentset graph`, with the reports they ask for, and gets the `intentset/export/0.3` envelope: the artifacts, the edges, the diagnostics and the snapshot.

## Preconditions

A configuration; L2 for the ownership report and L3 for evidence.

## Outcomes

Success: the envelope on standard output or in `--out`. Failure: restricted artifacts are withheld and counted unless `--include-restricted` is given.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
