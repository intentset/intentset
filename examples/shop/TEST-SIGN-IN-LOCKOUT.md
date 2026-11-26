---
markset: true
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-SIGN-IN-LOCKOUT
  type: verification
  title: Sign-in locks after five failed attempts
  status: draft
  owner: team-accounts
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  links:
    verifies:
    - BEH-SIGN-IN
    - RULE-SIGN-IN-LOCKOUT
  verification:
    method: automated
    locator: src/features/accounts/sign-in/policies/lockout.test.ts
    selector: lockout
---

# Sign-in locks after five failed attempts

## Procedure

Fail to sign in five times in a row, then try the right password at once and again after 15 minutes.

## Expected result

The right password is refused at once and accepted after 15 minutes.
