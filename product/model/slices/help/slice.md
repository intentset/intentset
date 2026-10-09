---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-HELP
  type: slice
  title: The help package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-HELP-TIPS]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/help/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/help/src/**
      - kind: verification
        path: packages/help/test/**
      - kind: documentation
        path: packages/help/README.md
    usesResources: []
---

# The help package

## Responsibility

Reads a help file and binds its tips to a product's controls, in a browser. It has no dependencies.

The slice is the package `@intentset/help`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. It uses no backend resources.

## Public contract

The exports of `packages/help/src/index.ts`, reached by other packages as `@intentset/help` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/help/test/`. No verification records yet.
