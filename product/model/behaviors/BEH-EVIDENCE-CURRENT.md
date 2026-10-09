---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-EVIDENCE-CURRENT
  type: behavior
  title: Only a pass at this commit and graph hash counts
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-EVIDENCE
  links:
    governedBy: [RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Only a pass at this commit and graph hash counts

## Behavior

The evidence report reads run records and gives each verification's status at the assessed snapshot, with link coverage and current-pass coverage reported apart.

## Preconditions

Run records outside the repository, never committed.

## Outcomes

Success: a pass at the assessed commit and graph hash is current. Failure: stale, skip, error, fail and missing are reported as what they are and never counted as a pass.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
