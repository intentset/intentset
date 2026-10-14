---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/rule/0.2
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

No command merges duplicate records or edits a file it did not create; `init` never overwrites a file. The one exception is `migrate`, which rewrites two values in a record's frontmatter, `spec` and `profile`, at the author's request and on a tree with no uncommitted changes to tracked files unless told otherwise, and changes nothing else.

## Sources

- CLAUDE.md, design invariant 1; the CLI's usage.
