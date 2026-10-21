---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ARCH-BASELINE-IDENTITY
  type: behavior
  title: A baseline entry holds what a finding is about, one imported name at a time
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ARCHITECTURE
  links:
    governedBy: [RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A baseline entry holds what a finding is about, one imported name at a time

## Behavior

`intentset architecture check --write-baseline` writes one entry per violation at the size a change fixes it: for a finding about an import, one entry per name the import takes, keyed by how it imports, its target and the name; for another finding, by its file and slice edges, its field, or, with neither, its message. A migration run holds an error when an entry holds each of its keys (VSA §9).

## Preconditions

A baseline written by intentset 0.9 or later. One written earlier still matches by its whole message until it is written again.

## Outcomes

Success: rewording a message, such as one that lists the declared areas, leaves every entry matching; dropping a name retires its entry. Failure: a baselined import that takes another name is an error that names the names the baseline does not hold, while the names it holds stay matched; a different violation in the same file is a new error, and its old entry is stale.

## Sources

- `spec/vsa-0.2.md` §9.
