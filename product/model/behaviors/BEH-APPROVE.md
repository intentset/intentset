---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-APPROVE
  type: behavior
  title: Approve writes a person's approval into drafts
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-AGENT-CONTEXT
  links:
    governedBy: [RULE-NEVER-REWRITE]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Approve writes a person's approval into drafts

## Behavior

A person runs `intentset approve <ID>... --by <person>`, naming records or giving the selector options of `intentset list`. Each matched draft gets `status: approved` and an `approval` block with basis `direct`, the person and the date (`--at`, today when absent), replacing any approval it carried. A knowledge record also gets its review: `reviewedBy`, `reviewedAt` and a `content-v1` pin of each source. Those lines change and no other byte does. Matched records that are not drafts are skipped and named. `--dry-run` reports the same and writes nothing. The command never commits.

## Preconditions

A repository with a configuration, and a git work tree with no uncommitted changes to tracked files unless `--allow-dirty` or `--dry-run` is given. `--by`, and at least one ID or selector option.

## Outcomes

Success: the files are rewritten and the command lists what it approved and skipped, exit 0. Failure: the tree is validated as it is and again with the approvals applied, at the level asked for (L1 by default); when the second run holds an error the first did not, those diagnostics are printed, nothing is written, and the exit is 1. A named ID that is no record, a missing `--by`, a bare run, a dirty tree, or a record whose frontmatter cannot be rewritten in place exits 2 with nothing written. The command does not know who runs it, so it authenticates nobody: the approval is a diff for the repository's own review.

## Sources

- Core §7; ADR 0022 and ADR 0020 in `docs/decisions/`; the CLI's usage, `intentset --help`.
