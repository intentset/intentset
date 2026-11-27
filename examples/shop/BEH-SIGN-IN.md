---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-SIGN-IN
  type: behavior
  title: Sign in
  status: draft
  delivery: built
  owner: team-accounts
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  parent: CAP-ACCOUNTS
  links:
    governedBy:
    - RULE-SIGN-IN-LOCKOUT
  availability:
    products:
    - PRD-SHOP
    releases:
    - v1
    roles:
    - customer
    editions:
    - standard
    flags: []
---

# Sign in

## Behavior

A customer signs in with their email address and password.

## Preconditions

The email address belongs to an account, and the account is not locked.

## Outcomes

Success: the customer is signed in. Failure: a wrong password is refused without saying whether the email address has an account, and counts toward the lockout.
