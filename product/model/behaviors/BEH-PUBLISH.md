---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-PUBLISH
  type: behavior
  title: Publication projects reviewed knowledge for one audience
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
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

Knowledge records that are reviewed and not draft or retired, and that explain no record whose work is planned (ADR 0017).

## Outcomes

Success: the documents, each keeping its sources and their hashes, audience, reviewer and time, and the snapshot named once for the run, in the index and the help file, so a change elsewhere in the model leaves every document's bytes as they were (ADR 0019). Failure: a refused request returns no documents and no help, and an excluded source's title or path appears nowhere.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
