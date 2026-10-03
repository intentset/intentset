---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-ASMT-AUTH
  type: rule
  title: Require assignment permission
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
---

# Require assignment permission

## Constraint

The server must reject scheduling unless the assessment is published and the actor is authorized to assign it to the requested class.
