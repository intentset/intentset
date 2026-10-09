---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-ARCHITECTURE
  type: slice
  title: The architecture package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-ARCH-CHECK, BEH-ARCH-BASELINE]
    dependsOn: [SLICE-CORE]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/architecture/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/architecture/src/**
      - kind: verification
        path: packages/architecture/test/**
      - kind: documentation
        path: packages/architecture/README.md
    usesResources: []
---

# The architecture package

## Responsibility

The VSA and profile checks: claims, the import graph, layers, regions, areas, exceptions and the baseline.

The slice is the package `@intentset/architecture`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. It uses no backend resources.

## Public contract

The exports of `packages/architecture/src/index.ts`, reached by other packages as `@intentset/architecture` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/architecture/test/`. No verification records yet.
