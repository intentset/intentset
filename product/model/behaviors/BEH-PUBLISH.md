---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-PUBLISH
  type: behavior
  title: Publication projects reviewed knowledge for one audience
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-PUBLISH
  links:
    governedBy: [RULE-FAIL-CLOSED, RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Publication projects reviewed knowledge for one audience

## Behavior

Someone publishes for a request naming an audience and availability, and gets the knowledge documents that request may see, an index and the help file.

## Preconditions

Knowledge records that are reviewed and not draft or retired.

## Outcomes

Success: the documents, each keeping its sources, snapshot, audience, reviewer and time. Failure: a refused request returns no documents and no help, and an excluded source's title or path appears nowhere.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
