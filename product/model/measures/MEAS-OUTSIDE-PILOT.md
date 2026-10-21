---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/measure/0.2
  id: MEAS-OUTSIDE-PILOT
  type: measure
  title: Outside codebases that complete the pilot
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: OUT-MODEL-STAYS-TRUE
  measure:
    metric: outside_pilots_completed
    baseline: unknown
    target: 'at least one, the alpha exit'
    window: 'Four consecutive weeks of pull requests on each outside codebase, read at the end of each calendar month after v0.1-draft'
    source: review-reports
    direction: increase
---

# Outside codebases that complete the pilot

## Method

Not measured yet. The reading is the number of codebases that Coral Reef Ventures did not write on which the pilot is complete. A pilot is complete when, for four consecutive weeks, Intentset has been a required check on every pull request to the default branch, running `intentset validate --level L2 --mode migration` against the codebase's baseline and `intentset review --fail-on-drift --baseline <file> --fail-on-baseline-growth`, and the baseline has only shrunk: no pull request in those weeks merged a baseline entry its base did not hold. It is read from that codebase's CI history, which its team shares, because the repository may be private. A maintainer reads it once a month by hand; nothing collects it yet. The baseline is unknown because no codebase's history has been read. The first outside adoption began in October 2026.

The reading is untrustworthy where the gate is weaker than it looks: a check that is required but skipped by an administrator's merge, a baseline written again in the same pull request that grew it, or a model that claims little of the codebase, so a reader takes the share of its code the model claims beside it.
