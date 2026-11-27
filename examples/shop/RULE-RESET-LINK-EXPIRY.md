---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/rule/0.4
  id: RULE-RESET-LINK-EXPIRY
  type: rule
  title: Reset links expire after one hour
  status: approved
  approval:
    at: "2026-11-26"
    basis: direct
    by: "team-accounts"
  owner: team-accounts
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
---

# Reset links expire after one hour

## Constraint

A password reset link stops working one hour after it is sent.
