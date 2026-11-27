---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-EXPORT
  type: behavior
  title: Graph prints the model as the export envelope
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 5
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

Someone runs `intentset graph`, with the reports they ask for, and gets the `intentset/export/0.8` envelope: the artifacts, each with its `delivery` as written (ADR 0017), the basis of its approval and the outside requirements it formalizes (ADR 0020), a knowledge record's review pins (ADR 0025), the edges, the diagnostics and the snapshot.

## Preconditions

A configuration; L2 for the ownership report and L3 for evidence.

## Outcomes

Success: the envelope on standard output or in `--out`. Failure: restricted artifacts are withheld and counted unless `--include-restricted` is given, and a withheld artifact's ID appears nowhere in the envelope: not in a link, and not as a review pin or a tip key, each of which is left out and counted in `withheldLinks`, and not in a diagnostic's text or `field`, where it reads "a withheld artifact" (export §3, #49).

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
