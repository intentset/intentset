---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/slice/0.4
  id: SLICE-ACCOUNT-RESET
  type: slice
  title: Password reset
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
  revision: 2
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
  links:
    implements:
    - BEH-RESET-PASSWORD
    informedBy:
    - ADR-RESET-LINK-LIFETIME
  slice:
    kind: product
    domain: accounts
    entrypoints:
    - src/features/accounts/reset/index.ts
    layers:
      policy:
      - src/features/accounts/reset/policies/**
    claims:
    - kind: source
      path: src/features/accounts/reset/**
    usesResources: []
    surfaces:
      /account/reset-password:
        knowledge:
        - KB-RESET-PASSWORD
---

# Password reset

## Responsibility

The code that sends reset links and accepts them.

## Public contract

Send a reset link to an account's email address, and set a new password from a link that is still valid.

## Verification

TEST-RESET-LINK-EXPIRY checks a link just before the hour and at the hour.
