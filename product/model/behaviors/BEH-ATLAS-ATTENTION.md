---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-ATLAS-ATTENTION
  type: behavior
  title: The Atlas lists what needs a person
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

# The Atlas lists what needs a person

## Behavior

A page of the Atlas, Needs attention, lists what is waiting on a person: records in draft, by type; claims (behaviors, rules and scenarios not retired) with no current pass, split into failing, stale, missing a run and named by no verification; files no slice claims, from the architecture check's VSA009 and AMP004 findings; and knowledge past draft held for review, with why. Each group names its count and what it counts over, and each item links its record. Without run evidence only the claims no verification names are listed and the rest are counted as not assessed; without an architecture check the page says unclaimed code was not checked. A group of more than ten items folds closed.

## Preconditions

A validated graph; run evidence and an architecture check for the groups that need them.

## Outcomes

Success: the page, second in the navigation. Failure: none of its own; an input it was not given is named as not checked.

## Sources

- intentset/intentset#159, the Atlas's hierarchy and usability at product scale.
