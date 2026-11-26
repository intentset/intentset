---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/slice/0.2
  id: SLICE-ACCOUNT-SIGN-IN
  type: slice
  title: Sign-in
  status: draft
  owner: team-accounts
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
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
---

# Sign-in

## Responsibility

The code that checks a customer's password and counts failed attempts.

## Public contract

Sign a customer in with an email address and a password, or refuse with a reason that does not say whether the account exists.

## Verification

TEST-SIGN-IN-LOCKOUT checks the fifth failed attempt and the 15 minutes after it.
