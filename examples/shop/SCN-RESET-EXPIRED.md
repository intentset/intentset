---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/scenario/0.4
  id: SCN-RESET-EXPIRED
  type: scenario
  title: Refuse an expired reset link
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
    illustrates:
    - BEH-RESET-PASSWORD
---

# Refuse an expired reset link

## Given

A customer asked for a reset link, and more than an hour has passed since it was sent.

## When

The customer opens the link and enters a new password.

## Then

The link is refused, the password is unchanged, and the customer is offered a new link.
