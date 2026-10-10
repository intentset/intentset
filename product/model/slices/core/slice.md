---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-CORE
  type: slice
  title: The core package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-VALIDATE-REPORTS, BEH-IMPACT, BEH-EXPORT, BEH-READ-EXPORT]
    informedBy: [ADR-PACKAGE-LAYERS]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/core/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/core/src/**
      - kind: verification
        path: packages/core/test/**
      - kind: documentation
        path: packages/core/README.md
    usesResources: []
---

# The core package

## Responsibility

The carrier reader, the types, the graph, the validator, impact and the export, and `readExport` for consumers. It has no dependencies (design invariant 8), which `dependsOn` being empty states and the architecture check holds.

The slice is the package `@intentset/core`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. ADR-PACKAGE-LAYERS records that choice, and that the check's VSA006 warning about the package's unlayered files stays. It uses no backend resources.

## Public contract

The exports of `packages/core/src/index.ts`, reached by other packages as `@intentset/core` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/core/test/`. The verification records of the behaviors it implements are TEST-VALIDATE-REPORTS (BEH-VALIDATE-REPORTS), TEST-IMPACT (BEH-IMPACT), TEST-EXPORT (BEH-EXPORT) and TEST-READ-EXPORT (BEH-READ-EXPORT). Each names the tests whose titles carry the behavior's ID, wherever those tests live; `pnpm run model:evidence` turns a run of them into run records.
