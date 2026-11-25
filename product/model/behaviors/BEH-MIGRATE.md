---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-MIGRATE
  type: behavior
  title: Migrate moves the records to the next specification version and changes nothing else
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-VALIDATE
  links:
    governedBy: [RULE-NEVER-REWRITE]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Migrate moves the records to the next specification version and changes nothing else

## Behavior

Someone runs `intentset migrate --to 0.3` in a repository whose records declare `spec: '0.2'` or `spec: '0.1'`. It moves each record the model reads one version at a time, rewriting `intentset.spec` and `intentset.profile` in its frontmatter and applying that version's own rewrites, of which there are none yet; it keeps every other byte, and prints how many records it moved. A record already at `0.3` is left alone, and so is one at a version it does not know.

## Preconditions

A repository root, and a work tree with no uncommitted changes to tracked files, so the rewrite is a diff of its own; `--allow-dirty` says otherwise.

## Outcomes

Success: the records are at `0.3`, the command says how many it moved and exits zero. Failure: a tree with uncommitted changes to tracked files (or no git work tree) is refused with nothing written, and a `--to` other than `0.3` is a usage error.

## Sources

- Core §1, what a move of `intentset.spec` means for a record, and ADR 0014; the move to `0.3`, ADR 0023 to ADR 0026.
