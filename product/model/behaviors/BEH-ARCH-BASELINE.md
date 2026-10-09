---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ARCH-BASELINE
  type: behavior
  title: A baseline holds existing violations and blocks new ones
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ARCHITECTURE
  links:
    governedBy: [RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A baseline holds existing violations and blocks new ones

## Behavior

A repository adopting the check writes the violations it has today with `--write-baseline`, and later runs read them with `--baseline` in migration mode. An exception record covers a named violation until it expires.

## Preconditions

A baseline file written by the same check.

## Outcomes

Success: a baselined violation does not fail the run, and one retired since is reported so the baseline can shrink. Failure: a new or enlarged violation is an error; strict mode ignores the baseline; an expired or incomplete exception is VSA013 and covers nothing.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
