---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-REVIEW-DRIFT
  type: behavior
  title: Review lists slices whose code changed while their records did not
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-AGENT-CONTEXT
  links:
    governedBy: [RULE-READ-ONLY-CHECKS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Review lists slices whose code changed while their records did not

## Behavior

Someone runs `intentset review --base <ref>`. Changed files are mapped to slices and behaviors, and each slice whose implementation changed since the base while none of the records describing it did is listed, unless a commit carries `Intentset-Unchanged: <slice ID>`.

## Preconditions

A git repository and a base ref.

## Outcomes

Success: the review, exit 0. Failure: with `--fail-on-drift`, any slice no commit acknowledged makes the command exit 1. A base that names no commit, or one that shares no history with HEAD, as a shallow fetch leaves it, is refused with exit 2 and no review, since what changed since it cannot be read and must never be reported as nothing.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
