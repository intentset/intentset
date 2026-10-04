---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/measure/0.1
  id: MEAS-PREPARE-ADOPTION
  type: measure
  title: Assignments scheduled a day or more ahead
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  parent: OUT-PREPARE
  measure:
    metric: assignments_scheduled_ahead
    baseline: unknown
    target: '60% of assignments scheduled at least one day before they open'
    window: '90 days after pilot-1'
    source: product-analytics
    direction: increase
---

# Assignments scheduled a day or more ahead

## Method

Product analytics counts every assignment scheduled in the window and the share whose scheduled time was a day or
more after the time it was created. A teacher who prepares in advance schedules ahead; one working at the last minute
schedules for the same day. The baseline is unknown because nothing is scheduled ahead before the capability exists.
