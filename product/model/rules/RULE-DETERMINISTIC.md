---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-DETERMINISTIC
  type: rule
  title: The same inputs give the same bytes
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# The same inputs give the same bytes

## Constraint

Every output is sorted and anything hashed is canonical JSON, so the same files at the same commit give the same diagnostics, export and hash.

## Sources

- CLAUDE.md, the working rules; ADR 0005.
