---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-PUBLISH
  type: behavior
  title: Publication projects reviewed knowledge for one audience
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 4
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

Someone publishes for a request naming an audience and availability, and gets the knowledge documents that request may see, an index, the help file and the snapshot file.

## Preconditions

Knowledge records that are reviewed and not draft or retired, and that explain no record whose work is planned (ADR 0017).

## Outcomes

Success: the documents, each keeping its sources and their hashes, audience, reviewer and time, and the snapshot named once for the run, in the snapshot file and in no document, index or help file, so publishing the same knowledge at another commit, or after a change elsewhere in the model, writes the same bytes in every file but that one, which `--no-snapshot` leaves out (ADR 0019, ADR 0021). Failure: a refused request returns no documents and no help, and an excluded source's title or path appears nowhere.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
