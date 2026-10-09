---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-UNRESOLVED-NOT-PASS
  type: rule
  title: What could not be checked is never reported as passed
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# What could not be checked is never reported as passed

## Constraint

A check that could not decide is unresolved, never pass. Stale, skip, error, fail and missing evidence never count as a pass, and link coverage and current-pass coverage are always reported separately. A waiver gives "with exceptions", never unqualified conformance.

## Sources

- CLAUDE.md, design invariants 3 and 6; Core §11.
