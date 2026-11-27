---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-APPROVE
  type: behavior
  title: Approve writes a person's approval into drafts
  status: draft
  approval:
    at: "2026-11-25"
    basis: direct
    by: "Gary Clarke"
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 4
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

A person runs `intentset approve <ID>... --by <person>`, naming records or giving the selector options of `intentset list`. Each matched draft gets `status: approved` and an `approval` block with basis `direct`, the person and the date (`--at`, today when absent), replacing any approval it carried. A knowledge record also gets its review: `reviewedBy`, `reviewedAt` and `review`, the content hash of each source with no `hash`, which means `content-v1` (ADR 0025), then `self`, its own content hash, and `gates`, the gate hash of its sources (ADR 0027), each the value the edited record has, in place of any earlier review, one left under the `intentset.org/review` extension included. Those lines change and no other byte does. Matched records that are not drafts are skipped and named. With `--renew-review`, it writes only the review, `reviewedBy`, `reviewedAt`, content-v1 pins of each source as it is now, `self` and `gates`, into each approved or deprecated knowledge record given, leaving `status` and `approval` as they are, and skips and names every other record, a draft or a record that is not knowledge. `--dry-run` reports the same and writes nothing. The command never commits.

## Preconditions

A repository with a configuration, and a git work tree with no uncommitted changes to tracked files unless `--allow-dirty` or `--dry-run` is given. `--by`, the person approving or, with `--renew-review`, the person reviewing, and at least one ID or selector option.

## Outcomes

Success: the files are rewritten and the command lists what it approved, or whose review it renewed, and what it skipped, exit 0. Failure: the tree is validated as it is and again with the approvals applied, at the level asked for (L1 by default); when the second run holds an error the first did not, for an approval or a renewal alike, those diagnostics are printed, nothing is written, and the exit is 1. A named ID that is no record, a missing `--by`, a bare run, a dirty tree, or a record whose frontmatter cannot be rewritten in place exits 2 with nothing written. The command does not know who runs it, so it authenticates nobody: the approval is a diff for the repository's own review.

## Sources

- Core §7 and §9; ADR 0022 (amended 2026-11-25 for `--renew-review`), ADR 0020 and ADR 0027 in `docs/decisions/`; the CLI's usage, `intentset --help`.
