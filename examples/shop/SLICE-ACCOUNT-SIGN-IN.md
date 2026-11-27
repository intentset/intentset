---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/slice/0.3
  id: SLICE-ACCOUNT-SIGN-IN
  type: slice
  title: Sign-in
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
    - BEH-SIGN-IN
  slice:
    kind: product
    domain: accounts
    entrypoints:
    - src/features/accounts/sign-in/index.ts
    layers:
      policy:
      - src/features/accounts/sign-in/policies/**
    claims:
    - kind: source
      path: src/features/accounts/sign-in/**
    usesResources: []
    surfaces:
      /sign-in:
        knowledge:
        - KB-RESET-PASSWORD
---

# Sign-in

## Responsibility

The code that checks a customer's password and counts failed attempts.

## Public contract

Sign a customer in with an email address and a password, or refuse with a reason that does not say whether the account exists.

## Verification

TEST-SIGN-IN-LOCKOUT checks the fifth failed attempt and the 15 minutes after it.
