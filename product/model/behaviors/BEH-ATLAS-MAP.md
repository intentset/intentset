---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ATLAS-MAP
  type: behavior
  title: The Atlas maps every record and link, and lets a reader explore it
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

# The Atlas maps every record and link, and lets a reader explore it

## Behavior

The Atlas has a Map page: every record in the snapshot as a node and every authored link as an edge, laid out when the Atlas is built so the same graph always gives the same picture. A record's color is its family, a draft is outlined dashed, and a verification's ring repeats its evidence status, green only for a current pass; each is also in the record's title. Without the script the picture stands and every record with a page links to it. With it, a reader finds a record by ID, shows or hides each family, pans and zooms, fills the screen with the map, and selects a record to see only it and its links, listed under the map; selecting it again opens its page, and Escape shows everything again.

## Preconditions

A model the Atlas can build, as for every other page.

## Outcomes

Success: the map, as a picture that works alone and an explorer when the script runs. Failure: a record the map cannot place is still listed, and nothing on the map claims a pass no run recorded.

## Sources

- ADR 0015 (`docs/decisions/0015-the-atlas-map-carries-one-script.md`).
