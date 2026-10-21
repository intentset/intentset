---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-REVIEW-BASELINE
  type: behavior
  title: Review lists the baseline entries the base did not hold
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-ARCHITECTURE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Review lists the baseline entries the base did not hold

## Behavior

Someone runs `intentset review --base <ref> --baseline <file>`. The baseline is compared with the base's copy of the same file: the entries the base did not hold, the entries it held that are gone, the entries that moved with a renamed file, the cycles replaced by smaller ones, and the entries written before 0.9 written again in the current form, one per name, each with what it says.

## Preconditions

A git repository, a base ref, and a baseline file inside the repository.

## Outcomes

Success: the review lists the comparison and exits 0. Failure: with `--fail-on-baseline-growth`, any entry the base did not hold makes the command exit 1; the flag without `--baseline` is a usage error, exit 2. A base with no copy of the file makes every entry new. A rewrite in the current form is not growth.

## Sources

- `spec/vsa-0.2.md` §9.
