---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-ATLAS-MAP
  type: behavior
  title: The Atlas maps every record and link, and lets a reader explore it
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 4
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

The Atlas has a Map page: every record in the snapshot as a node and every authored link as an edge, laid out when the Atlas is built so the same graph always gives the same picture. The layout is layered (#159): products, intents and outcomes in rows on top, each outcome's measures beside it, then every capability as one node with a count of the records it holds, and records no capability reaches in a row of their own. A capability holds its behaviors, their rules and scenarios, the checks and knowledge that cover them, and the slices, contracts and decisions that deliver them, laid out in columns beneath the capabilities and hidden until a reader opens it; one is open at a time, and a record two capabilities reach is drawn in the first by ID. The map comes first on its page, after one sentence saying what it holds, and how to read it and use it follows below the picture. Where the IDs show, no record's ID overlaps another record's ID or circle in any view the map shows (the overview, or it with one capability open), and the picture is framed to what is drawn, IDs included, so it fills its frame. A model of a few thousand records shows an ID only where it fits: at any zoom the IDs and circles keep about the size they have on screen (type of about 12 pixels, a circle never more than a fixed multiple of its size at the fit), and the IDs shown are those that overlap no other shown ID, taking the selected record and its links first and then products, capabilities and slices before behaviors, rules and checks, so zooming in shows more of them and never makes one larger. A record's color is its family, a draft is outlined dashed, and a verification's ring repeats its evidence status, green only for a current pass; each is also in the record's title. Without the script the picture stands, its capabilities folded, and every record with a page links to it. With it, a reader opens a capability by selecting it and folds it again with All capabilities, finds a record by ID (which opens the capability holding it), shows or hides each family, pans and zooms, fills the screen with the map, and selects a record to see only it and its links, listed under the map; selecting it again opens its page, and Escape shows everything again.

## Preconditions

A model the Atlas can build, as for every other page.

## Outcomes

Success: the map, as a picture that works alone and an explorer when the script runs. Failure: a record the map cannot place is still listed, and nothing on the map claims a pass no run recorded.

## Sources

- ADR 0015 (`docs/decisions/0015-the-atlas-map-carries-one-script.md`).
