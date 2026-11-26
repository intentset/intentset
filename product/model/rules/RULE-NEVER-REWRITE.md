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
  revision: 3
---

# Tools never rewrite a record

## Constraint

No command merges duplicate records or edits a file it did not create; `init` never overwrites a file. There are two exceptions, each at the author's request and on a tree with no uncommitted changes to tracked files unless told otherwise. `migrate` rewrites `spec` and `profile` in a record's frontmatter, applies that version's transforms (moving to `0.3`, a `status` of `implemented` or `released` to `approved`, writing `delivery: built` beside it where the type carries delivery and states none, ADR 0023, and a knowledge review's move from the extension to `review`, ADR 0025), and re-pins the review pins that matched before the move. `approve` rewrites `status` and `approval` in the drafts it is given, and in a knowledge record among them `reviewedBy`, `reviewedAt` and `review`; with `--renew-review` it rewrites only `reviewedBy`, `reviewedAt` and `review` of the approved or deprecated knowledge it is given. Neither changes anything else.

## Sources

- CLAUDE.md, design invariant 1; the CLI's usage; ADR 0022, ADR 0023 and ADR 0025; the maintainer's decision of 2026-11-25.
