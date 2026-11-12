---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-REVIEW-PINS
  type: behavior
  title: A knowledge review stays current while what it explains is unchanged
  status: draft
  delivery: built
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

# A knowledge review stays current while what it explains is unchanged

## Behavior

Someone signs off a knowledge record and pins a hash of each source it was reviewed against (publication §3, ADR 0018). With `hash: content-v1` each pin is the source's content hash, which leaves out its `status`, `delivery`, `reviewedBy`, `reviewedAt` and its own review pins, and names it when it is deprecated or retired. Without `hash`, each pin is the source's whole-file hash, as every earlier review is. Publication, `validate`, the export's knowledge report and the Atlas judge the knowledge current while every pin matches. Each record's content hash is in core and in `intentset context --json`, so a script that writes pins can read it.

## Preconditions

Knowledge with `reviewedBy`, `reviewedAt` and a pin for every source it explains and every rule governing an explained behavior.

## Outcomes

Success: approving, implementing or releasing a source, or setting its delivery, leaves a `content-v1` review current, and a review without `hash` reads as it always did. Failure: an edit to what a source promises, its deprecation or retirement, a missing pin or a `hash` the implementation does not read makes the knowledge `needs-review`, and it is not published.
