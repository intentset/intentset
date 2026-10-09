---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-IMPACT
  type: behavior
  title: Impact lists what depends on an artifact
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-VALIDATE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Impact lists what depends on an artifact

## Behavior

Someone runs `intentset impact <ID>` and gets what depends on that artifact: direct dependents, candidates, the review context and its ancestors, each with its path.

## Preconditions

The ID is in the model.

## Outcomes

Success: the report, exit 0. Failure: an ID not in the model is reported.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
