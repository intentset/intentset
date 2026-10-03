---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ASMT-SCHEDULE
  type: behavior
  title: Schedule an assessment
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  parent: CAP-ASMT-ASSIGN
  links:
    governedBy:
    - RULE-ASMT-FUTURE
    - RULE-ASMT-AUTH
  availability:
    products:
    - PRD-LANTERN
    releases:
    - pilot-1
    roles:
    - teacher
    editions:
    - standard
    flags: []
---

# Schedule an assessment

## Behavior

A teacher submits a future release time for a published assessment and a class.

## Preconditions

The teacher is authorized to assign to the class. The assessment is published and the requested time is in the future.

## Outcomes

Success: the schedule is recorded and students gain access at the release time under the eventual implementation tolerance. Failure: invalid time, unauthorized class, or unpublished assessment is rejected without creating a schedule. Delivery tolerance, cancellation, and retry semantics remain draft decisions.
