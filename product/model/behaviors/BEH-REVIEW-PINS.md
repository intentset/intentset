---
markset: true
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

# A knowledge review stays current while what it explains is unchanged

## Behavior

Someone signs off a knowledge record and pins a hash of each source it was reviewed against, in `review`, a core field on knowledge (Core §9, publication §3, ADR 0018, ADR 0025). Without `hash`, or with `hash: content-v1`, each pin is the source's content hash, which leaves out its `status`, `delivery`, `reviewedBy`, `reviewedAt`, its `approval`, its `formalizes` (ADR 0020) and its own review pins, and names it when it is deprecated or retired. With `hash: file-v1`, each pin is the source's whole-file hash, which `intentset migrate --to 0.3` names on every review that named no hash before. `validate` reports `review` on another type, a malformed review, and the `intentset.org/review` extension 0.2 read the review from, as CORE001. Publication, `validate`, the export's knowledge report and the Atlas judge the knowledge current while every pin matches. A review may also pin the knowledge's own text, `self`, its content hash without `ending`, and who could see each source, `gates`, the hash of each source's audiences, visibility and availability (ADR 0027); `validate` reports either when it is not a non-empty string as CORE001, null included, since only a null `hash` or `snapshot` reads as absent. A `self` that no longer matches makes the knowledge `needs-review`, and `gates` decides only whether it can be kept under review. Each record's content hash is in core and in `intentset context --json`; `intentset approve` is what writes a review, and no command prints a gate hash to copy.

## Preconditions

Knowledge with `reviewedBy`, `reviewedAt` and a pin for every source it explains and every rule governing an explained behavior.

## Outcomes

Success: approving, implementing or releasing a source, setting its delivery, recording the basis of its approval or naming the outside requirement it formalizes leaves a `content-v1` review current, and a `file-v1` review reads as a review without `hash` did before 0.3; deprecating reviewed knowledge leaves its `self` matching. Failure: an edit to what a source promises, its deprecation or retirement, a missing pin, a `hash` the implementation does not read, a review left under the retired extension (which is CORE001 and counts as none), or an edit to the knowledge's own text after a review that pins it in `self`, makes the knowledge `needs-review`, and it is not published as current.
