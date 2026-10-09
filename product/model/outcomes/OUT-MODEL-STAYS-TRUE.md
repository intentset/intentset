---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/outcome/0.1
  id: OUT-MODEL-STAYS-TRUE
  type: outcome
  title: The model stays true as the code changes
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: INT-KEEP-CONTROL
---

# The model stays true as the code changes

## Measure

Not measured yet, and no measure record exists. A candidate is the share of merged changes in an adopting repository whose slices changed code and either updated their records or carried an `Intentset-Unchanged` trailer, read from `intentset review`. No evidence source is registered for it.

## Sources

- ADR 0010, agents keep the model current.
- Core §10.
