---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-RESET-LINK-EXPIRY
  type: verification
  title: A reset link works for one hour
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
  links:
    verifies:
    - BEH-RESET-PASSWORD
    - RULE-RESET-LINK-EXPIRY
    - SCN-RESET-EXPIRED
  verification:
    method: automated
    locator: src/features/accounts/reset/policies/link-expiry.test.ts
    selector: reset link
---

# A reset link works for one hour

## Procedure

Send a link, then try it one millisecond before the hour and again at the hour.

## Expected result

The link is accepted before the hour and refused at the hour.
