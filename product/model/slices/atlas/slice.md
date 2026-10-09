---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-ATLAS
  type: slice
  title: The atlas package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-ATLAS]
    dependsOn: [SLICE-CORE, SLICE-PUBLISHER]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/atlas/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/atlas/src/**
      - kind: verification
        path: packages/atlas/test/**
      - kind: documentation
        path: packages/atlas/README.md
    usesResources: []
---

# The atlas package

## Responsibility

Static review pages over an export.

The slice is the package `@intentset/atlas`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. It uses no backend resources.

## Public contract

The exports of `packages/atlas/src/index.ts`, reached by other packages as `@intentset/atlas` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/atlas/test/`. No verification records yet.
