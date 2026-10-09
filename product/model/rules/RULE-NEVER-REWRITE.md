---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-NEVER-REWRITE
  type: rule
  title: Tools never rewrite a record
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# Tools never rewrite a record

## Constraint

No command merges duplicate records or edits a file it did not create; `init` never overwrites a file.

## Sources

- CLAUDE.md, design invariant 1; the CLI's usage.
