---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-MIGRATE
  type: behavior
  title: Migrate moves the records to the next specification version and rewrites only what the move requires
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
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

# Migrate moves the records to the next specification version and rewrites only what the move requires

## Behavior

Someone runs `intentset migrate --to 0.3` in a repository whose records declare `spec: '0.2'` or `spec: '0.1'`. It moves each record the model reads one version at a time, rewriting `intentset.spec` and `intentset.profile` in its frontmatter and applying that version's own rewrites. The move to `0.3` has one (ADR 0023): a `status` of `implemented` or `released` becomes `approved`, and a capability, behavior, rule, scenario, slice or contract that states no `delivery` gets `delivery: built`, which is what the status claimed (a `delivery` key holding `null`, `~` or nothing states none, so that line becomes `delivery: built`); a record that states `delivery` keeps it, a type that never carries it gets nothing more, and a deprecated record is left as it is. It keeps every other byte, and the quoting and comment of each line it rewrites, reads past a comment line inside the `intentset:` mapping wherever its `#` stands, reads a key as YAML does (bare or quoted, with or without spaces before the colon), and prints how many records it moved. A record the rewrite could not move in full is not counted as moved: one that no longer reads as YAML, one that still declares `implemented` or `released`, or one whose status claimed an implementation on a type that carries `delivery` and that is left with none; the command names it, with which of these it is, and says what to change. A record already at `0.3` is left alone, and so is one at a version it does not know.

## Preconditions

A repository root, and a work tree with no uncommitted changes to tracked files, so the rewrite is a diff of its own; `--allow-dirty` says otherwise.

## Outcomes

Success: the records are at `0.3`, each with a status `0.3` lists, the command says how many it moved and exits zero. A record the rewrite could not move in full is named, with what to change, and the command exits 1. Failure: a tree with uncommitted changes to tracked files (or no git work tree) is refused with nothing written, and a `--to` other than `0.3` is a usage error.

## Sources

- Core §1, what a move of `intentset.spec` means for a record, and ADR 0014; the move to `0.3`, ADR 0023 to ADR 0026.
