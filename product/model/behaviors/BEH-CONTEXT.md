---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-CONTEXT
  type: behavior
  title: Context gives an agent what the code it will change promises
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
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

An agent runs `intentset context` with an ID or a file it is about to edit, and gets the owning slice, its behaviors, rules, scenarios, contracts, decisions and checks, with their paths. With `--json` each record also carries its `sourceHash` and its `contentHash`, which a script reads to write `content-v1` review pins (ADR 0018).

## Preconditions

Given a file, a slice claims it.

## Outcomes

Success: the bounded context, restricted artifacts withheld unless asked for. Failure: an ID not in the model is reported as unresolved; a file no slice claims is reported as that, naming the file and what would give it a context (a record's ID, or a slice's claim), never as a malformed ID.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
