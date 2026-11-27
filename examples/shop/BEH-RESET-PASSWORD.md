---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-RESET-PASSWORD
  type: behavior
  title: Reset a forgotten password
  status: approved
  approval:
    at: "2026-11-26"
    basis: direct
    by: "team-accounts"
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
    - RULE-RESET-LINK-EXPIRY
    - RULE-RESET-LINK-ONCE
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

Success: the new password replaces the old one, and the link stops working. Failure: an expired or already used link is refused, and the password is unchanged. Asking for a link for an email address with no account looks the same as asking for one that has an account.
