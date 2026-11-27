---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/rule/0.3
  id: RULE-SIGN-IN-LOCKOUT
  type: rule
  title: Lock sign-in after five failed attempts
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

# Lock sign-in after five failed attempts

## Constraint

After five failed sign-in attempts in a row, the account refuses to sign in for 15 minutes, even with the right password.
