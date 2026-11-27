---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-ATLAS-NEIGHBORHOOD
  type: behavior
  title: A record's page draws its neighborhood
  status: draft
  delivery: built
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

# A record's page draws its neighborhood

## Behavior

Every record's page ends with its neighborhood: the record, picked out, every record one link away, and, while they fit under twenty-four, the records two links away, laid out by the force layout the whole-model map used until #159, from each ID's hash and in ID order, so the same graph gives the same picture. Each record in it is a link to its page, and the picture carries no control and no script, so a record's page still runs none. A record with no links says so instead of drawing a picture of one.

## Preconditions

A model the Atlas can build.

## Outcomes

Success: the picture on every record's page. Failure: none of its own; a crowded neighborhood stops at the limit rather than growing.

## Sources

- intentset/intentset#159, the force layout kept as a neighborhood view.
