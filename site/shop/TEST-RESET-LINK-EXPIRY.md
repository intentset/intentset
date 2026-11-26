---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-RESET-LINK-EXPIRY
  type: verification
  title: A reset link works for one hour
  status: draft
  owner: team-accounts
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  links:
    verifies:
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
