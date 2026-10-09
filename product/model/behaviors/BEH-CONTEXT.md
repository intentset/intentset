---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-CONTEXT
  type: behavior
  title: Context gives an agent what the code it will change promises
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
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

# Context gives an agent what the code it will change promises

## Behavior

An agent runs `intentset context` with an ID or a file it is about to edit, and gets the owning slice, its behaviors, rules, scenarios, contracts, decisions and checks, with their paths.

## Preconditions

Given a file, a slice claims it.

## Outcomes

Success: the bounded context, restricted artifacts withheld unless asked for. Failure: an ID not in the model, or a file no slice claims, is reported.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
