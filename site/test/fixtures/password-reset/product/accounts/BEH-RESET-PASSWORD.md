---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-RESET-PASSWORD
  type: behavior
  title: Reset a forgotten password
  status: draft
  owner: team-accounts
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  parent: CAP-ACCOUNTS
  links:
    governedBy:
    - RULE-RESET-LINK-EXPIRY
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

# Reset a forgotten password

## Behavior

A customer who has forgotten their password asks for a reset link, and sets a new password from the link in the email.

## Preconditions

The email address belongs to an account.

## Outcomes

Success: the new password replaces the old one and the link stops working. Failure: an expired or already used link is refused, and the password is unchanged.
