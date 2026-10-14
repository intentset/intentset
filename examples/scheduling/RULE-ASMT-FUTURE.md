---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/rule/0.2
  id: RULE-ASMT-FUTURE
  type: rule
  title: Require a future release time
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
---

# Require a future release time

## Constraint

The authoritative server time must be earlier than the requested release time when the schedule is accepted.
