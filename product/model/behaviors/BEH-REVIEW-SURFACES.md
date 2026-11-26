---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-REVIEW-SURFACES
  type: behavior
  title: Review lists the surfaces a change adds or rewords on a slice past draft
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-REVIEW-VIEWS
  links:
    governedBy: [RULE-READ-ONLY-CHECKS]
  formalizes:
    - source: https://github.com/intentset/intentset/issues/143
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Review lists the surfaces a change adds or rewords on a slice past draft

## Behavior

Someone runs `intentset review --base <ref>`. The report gains a section, "Surfaces changed", after approvals and status changes, and its JSON gains `surfaceChanges`: each changed slice past draft whose surface IDs were added or removed, or whose list of leads changed, against the base's copy. A base copy at an earlier version is read as `intentset migrate` would move it, so a change that only migrates adds no line. It is where a reviewer sees a surface ID before it reaches a reader's help file (ADR 0028).

## Preconditions

A repository with git history and a base to compare with.

## Outcomes

Success: every slice past draft whose surfaces changed is listed with each key added, removed or re-led, and a draft slice is not. Failure: with no base, the section says nothing was compared; the section never fails the run.
