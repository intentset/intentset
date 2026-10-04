---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/measure/0.1
  id: MEAS-PREPARE-MINUTES
  type: measure
  title: Teacher minutes spent preparing an assignment
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  parent: OUT-PREPARE
  measure:
    metric: teacher_prep_minutes
    baseline: unknown
    target: '20% below the measured pilot baseline'
    window: '90 days after pilot-1'
    source: task-study
    direction: decrease
---

# Teacher minutes spent preparing an assignment

## Method

An observed task study: a teacher prepares three assignments of the kinds the pilot schools set most, timed from
opening the class to the last assignment being scheduled. The study runs once before the pilot to take the baseline
and once in the window. The median over participants is the reading; the product reviewer signs off the comparison.
