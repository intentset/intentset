---
markset: true
intentset:
  spec: '0.2'
  profile: intentset/decision/0.2
  id: ADR-RESET-LINK-LIFETIME
  type: decision
  title: Keep reset links short-lived
  status: draft
  owner: team-accounts
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
---

# Keep reset links short-lived

## Context

A reset link is a way into the account for anyone who can read the customer's email: a shared computer, a forwarded message, an inbox someone else can open. The longer the link works, the longer that way in stays open.

## Decision

A reset link stops working one hour after it is sent, and as soon as it has been used.

## Consequences

A customer who opens the email later than that asks for a new link. When customers report links that have already expired, check how long the email takes to arrive before changing how long the link lasts.
