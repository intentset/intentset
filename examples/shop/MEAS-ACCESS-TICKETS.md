---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/measure/0.4
  id: MEAS-ACCESS-TICKETS
  type: measure
  title: Support requests about getting into an account
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
  parent: OUT-FEWER-LOCKOUTS
  measure:
    metric: access_tickets_per_1000_customers
    baseline: unknown
    target: 'half the baseline'
    window: '90 days after v1'
    source: support-tickets
    direction: decrease
---

# Support requests about getting into an account

## Method

Each month, count the support tickets tagged as account access, per thousand active customers. The baseline is the count for the month before reset links and the lockout ship; the reading is the mean of the three months after.
