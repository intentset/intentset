---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ARCH-CHECK
  type: behavior
  title: The architecture check holds the code to its slices
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ARCHITECTURE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC, RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# The architecture check holds the code to its slices

## Behavior

Someone runs `intentset architecture check`. Every in-scope file is resolved to the slice that claims it, every import is resolved, and ownership, entrypoints, cross-slice imports, declared dependencies, cycles, layers and regions are checked (VSA §2 to §5, the profile's TS and AMP rules).

## Preconditions

A model with slices; `.intentset/architecture.yaml` when the repository's layout differs from the reference layout; TypeScript 7.

## Outcomes

Success: exit 0 with no errors. Failure: each violation is a diagnostic naming the file, the import and the rule, and the command exits 1. An import it cannot resolve is reported, never passed.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
