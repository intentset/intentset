---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-REVIEW-PINS
  type: behavior
  title: A knowledge review stays current while what it explains is unchanged
  status: draft
  delivery: built
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

# A knowledge review stays current while what it explains is unchanged

## Behavior

Someone signs off a knowledge record and pins a hash of each source it was reviewed against, in `review`, a core field on knowledge (Core §9, publication §3, ADR 0018, ADR 0025). Without `hash`, or with `hash: content-v1`, each pin is the source's content hash, which leaves out its `status`, `delivery`, `reviewedBy`, `reviewedAt`, its `approval`, its `formalizes` (ADR 0020) and its own review pins, and names it when it is deprecated or retired. With `hash: file-v1`, each pin is the source's whole-file hash, which `intentset migrate --to 0.3` names on every review that named no hash before. `validate` reports `review` on another type, a malformed review, and the `intentset.org/review` extension 0.2 read the review from, as CORE001. Publication, `validate`, the export's knowledge report and the Atlas judge the knowledge current while every pin matches. Each record's content hash is in core and in `intentset context --json`, so a script that writes pins can read it.

## Preconditions

Knowledge with `reviewedBy`, `reviewedAt` and a pin for every source it explains and every rule governing an explained behavior.

## Outcomes

Success: approving, implementing or releasing a source, setting its delivery, recording the basis of its approval or naming the outside requirement it formalizes leaves a `content-v1` review current, and a `file-v1` review reads as a review without `hash` did before 0.3. Failure: an edit to what a source promises, its deprecation or retirement, a missing pin, a `hash` the implementation does not read, or a review left under the retired extension (which is CORE001 and counts as none) makes the knowledge `needs-review`, and it is not published.
