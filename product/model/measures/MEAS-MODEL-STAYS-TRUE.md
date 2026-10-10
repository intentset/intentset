---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/measure/0.1
  id: MEAS-MODEL-STAYS-TRUE
  type: measure
  title: Changes to a slice's code that leave its records behind
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: OUT-MODEL-STAYS-TRUE
  measure:
    metric: unacknowledged_drift_share
    baseline: unknown
    target: 'Proposed, for the maintainers to confirm: none of the pull requests in a month'
    window: 'Each calendar month after v0.1-draft'
    source: review-reports
    direction: decrease
---

# Changes to a slice's code that leave its records behind

## Method

Not measured yet. The reading is the share of pull requests, among those whose changes touched a slice's code, on
which `intentset review --fail-on-drift` listed a slice no commit acknowledged at the pull request's last run, read
from the CI logs of each repository that keeps a model: this one, and those in the adoption log. A maintainer takes it
once a month by hand; nothing collects it yet. The baseline is unknown because no month has been read.

The reading is untrustworthy where the gate cannot see drift: an `Intentset-Unchanged` trailer on a change that did
alter behavior reads as acknowledged, and a repository whose model claims little of its code shows little drift
because little is claimed, so a reader takes the claimed share of each repository's code beside it. A gate that fails
closed makes merged drift zero by construction, which is why the reading is taken on pull requests' last runs rather
than on what merged.
