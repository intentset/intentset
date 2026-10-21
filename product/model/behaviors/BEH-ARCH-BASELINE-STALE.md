---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ARCH-BASELINE-STALE
  type: behavior
  title: A baseline entry whose violation is gone is an error
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ARCHITECTURE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A baseline entry whose violation is gone is an error

## Behavior

In migration mode, `intentset architecture check` and `validate` at L2 report each baseline entry that matches no diagnostic as VSA014, naming the entry and its index in the file. `--write-baseline` records each entry with the message it holds, leaves VSA014 out, and says how many entries the file it replaces did not hold and how many of its entries are gone.

## Preconditions

A baseline file given with `--baseline`, in migration mode.

## Outcomes

Success: every entry matches a current violation, and the run passes on the baselined ones. Failure: an entry whose violation is gone is a VSA014 error until the baseline is written again without it, so a fixed violation cannot come back under it; strict mode ignores the baseline and reports no VSA014.

## Sources

- `spec/vsa-0.2.md` §9.
