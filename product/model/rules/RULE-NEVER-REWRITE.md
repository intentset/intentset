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

No command merges duplicate records or edits a file it did not create; `init` never overwrites a file. There are two exceptions, each at the author's request and on a tree with no uncommitted changes to tracked files unless told otherwise. `migrate` rewrites two values in a record's frontmatter, `spec` and `profile`. `approve` rewrites `status` and `approval` in the drafts it is given, and in a knowledge record among them `reviewedBy`, `reviewedAt` and the review extension. Neither changes anything else.

## Sources

- CLAUDE.md, design invariant 1; the CLI's usage; ADR 0022.
