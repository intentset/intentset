---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-MIGRATE
  type: behavior
  title: Migrate moves the records to the next specification version and rewrites only what the move requires
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 6
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

Someone runs `intentset migrate --to 0.3` in a repository whose records declare `spec: '0.2'` or `spec: '0.1'`. It moves each record the model reads one version at a time, rewriting `intentset.spec` and `intentset.profile` in its frontmatter and applying that version's own rewrites. The move to `0.3` has two. ADR 0023: a `status` of `implemented` or `released` becomes `approved`, and a capability, behavior, rule, scenario, slice or contract that states no `delivery` gets `delivery: built`, which is what the status claimed (a `delivery` key holding `null`, `~` or nothing states none, so that line becomes `delivery: built`); a record that states `delivery` keeps it, a type that never carries it gets nothing more, and a deprecated record is left as it is. ADR 0025: a knowledge record's review under `extensions.intentset.org/review` moves to `review` where `extensions` stood, each line one level up and otherwise as written, with `hash: file-v1` as its first line where it named no hash, so no review changes what it pins; `extensions` goes when nothing else is left in it. The move rewrites `spec` and `profile`, which both pin kinds cover, so after moving every record in memory it re-pins each knowledge review pin, in a record it moved or one already at `0.3`, that matched before the move: a `content-v1` or `file-v1` pin equal to its source's hash as the source was written, at the version it declared, becomes the same kind of hash of the source as moved, keeping its quoting, so a review current before the move is current after it with no manual step. A review's `self`, the knowledge's own content hash (ADR 0027), is re-pinned the same way when it equals that hash of the knowledge as written and the knowledge's own version read `self` (`0.3` or later), and `gates`, which covers neither `spec` nor `profile`, is never touched. A `self` or `gates` in a `0.2` review extension, keys no reader before `0.3` read and no earlier tool could have computed, is left out of `review` with every line nested under it, and the command names each record it left them out of and the keys, on standard error, without failing: carried over, they would become pins, and a review current before the move would need review after it. A pin's kind is the one its record's own version read: before `0.3` a review with no `hash` pinned the whole file, and any `hash` but `content-v1` (`file-v1` included) was a kind no pin matched. A pin that did not match, is of a kind its version did not know, or names a record outside the tree, is left as written, and a knowledge record at a version the command does not know keeps every byte, its pins included, so a stale review stays stale, and no pin is written that was not there. It keeps every other byte, and the quoting and comment of each line it rewrites, reads past a comment line inside the `intentset:` mapping wherever its `#` stands, reads a key as YAML does (bare or quoted, with or without spaces before the colon), and prints how many records it moved, how many pins it re-pinned and how many it left. A record the rewrite could not move in full is not counted as moved: one that no longer reads as YAML, one that still declares `implemented` or `released`, one whose status claimed an implementation on a type that carries `delivery` and that is left with none, or one that still carries the review extension (a record that is not knowledge keeps it, since `review` is CORE001 there too), whose review would pin another kind, or whose review holds what `0.3` rejects and the extension's reader ignored (a key other than `sources`, `hash` and `snapshot`, a pin key that is not an ID, or a pin, `hash` or `snapshot` that is not a non-empty string), which would read as no review; the command names it, with which of these it is, and says what to change; so is a pin that matched but is written in a form the rewrite does not reach (a key written as an escape), which is left as written; and so is each pin it could not compare because the knowledge, or a source it pins, does not read as YAML at `0.3` (a `__proto__` key a `0.2` reader dropped), which is left as written and not counted, with the advice to discard the run, make the record read and migrate again. A record already at `0.3` is left alone, and so is one at a version it does not know.

## Preconditions

A repository root, and a work tree with no uncommitted changes to tracked files, so the rewrite is a diff of its own; `--allow-dirty` says otherwise.

## Outcomes

Success: the records are at `0.3`, each with a status `0.3` lists and its review, if any, under `review` with the pin kind it had and each pin that matched before the move re-pinned to its source as moved, the command says how many records it moved and pins it re-pinned and left, and exits zero. A record the rewrite could not move in full, a matched pin it could not reach, or a pin it could not compare because a record does not read, is named, with what to change, and the command exits 1. Failure: a tree with uncommitted changes to tracked files (or no git work tree) is refused with nothing written, and a `--to` other than `0.3` is a usage error.

## Sources

- Core §1, what a move of `intentset.spec` means for a record, and ADR 0014; the move to `0.3`, ADR 0023 to ADR 0027; the re-pinning, the maintainer's decision of 2026-11-25 (ADR 0025, amended), and CLAUDE.md design invariant 1.
