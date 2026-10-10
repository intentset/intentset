---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-VERIFICATION
  type: slice
  title: The verification package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-EVIDENCE-IMPORT, BEH-EVIDENCE-CURRENT]
    dependsOn: [SLICE-CORE]
    informedBy: [ADR-PACKAGE-LAYERS]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/verification/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/verification/src/**
      - kind: verification
        path: packages/verification/test/**
      - kind: documentation
        path: packages/verification/README.md
    usesResources: []
---

# The verification package

## Responsibility

Run records, their freshness against the commit and graph hash, and the reporter adapters that turn test reports into them.

The slice is the package `@intentset/verification`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. ADR-PACKAGE-LAYERS records that choice, and that the check's VSA006 warning about the package's unlayered files stays. It uses no backend resources.

## Public contract

The exports of `packages/verification/src/index.ts`, reached by other packages as `@intentset/verification` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/verification/test/`. The verification records of the behaviors it implements are TEST-EVIDENCE-IMPORT (BEH-EVIDENCE-IMPORT) and TEST-EVIDENCE-CURRENT (BEH-EVIDENCE-CURRENT). Each names the tests whose titles carry the behavior's ID, wherever those tests live; `pnpm run model:evidence` turns a run of them into run records.
