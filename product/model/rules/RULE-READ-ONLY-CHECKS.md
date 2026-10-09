---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-READ-ONLY-CHECKS
  type: rule
  title: Checks run no code, use no network and change nothing
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# Checks run no code, use no network and change nothing

## Constraint

`validate`, `graph`, `architecture check`, `impact` and `review` execute no code from the repository, open no network connection and write no file other than one the command was explicitly asked to write. Publication and serving are separate, explicit commands.

## Sources

- CLAUDE.md, design invariant 7.
