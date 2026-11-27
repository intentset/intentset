---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/rule/0.3
  id: RULE-FAIL-CLOSED
  type: rule
  title: Publication denies by default
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# Publication denies by default

## Constraint

Publication intersects every availability dimension, excludes draft and retired records and never leaks an excluded source's title or path. Documentation metadata never grants runtime access.

## Sources

- CLAUDE.md, design invariant 4; spec/publication.md.
