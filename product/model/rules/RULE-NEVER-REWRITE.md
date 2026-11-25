---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/rule/0.3
  id: RULE-NEVER-REWRITE
  type: rule
  title: Tools never rewrite a record
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
---

# Tools never rewrite a record

## Constraint

No command merges duplicate records or edits a file it did not create; `init` never overwrites a file. There are two exceptions, each at the author's request and on a tree with no uncommitted changes to tracked files unless told otherwise. `migrate` rewrites `spec` and `profile` in a record's frontmatter and, moving to `0.3`, a `status` of `implemented` or `released` to `approved`, writing `delivery: built` beside it where the type carries delivery and states none (ADR 0023). `approve` rewrites `status` and `approval` in the drafts it is given, and in a knowledge record among them `reviewedBy`, `reviewedAt` and the review extension. Neither changes anything else.

## Sources

- CLAUDE.md, design invariant 1; the CLI's usage; ADR 0022 and ADR 0023.
