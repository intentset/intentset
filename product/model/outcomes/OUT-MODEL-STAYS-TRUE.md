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

Judged by MEAS-MODEL-STAYS-TRUE: the share of pull requests touching a slice's code on which `intentset review` still listed unacknowledged drift at their last run, read monthly from the CI of each repository that keeps a model. Not measured yet.

## Sources

- ADR 0010, agents keep the model current.
- Core §10.
