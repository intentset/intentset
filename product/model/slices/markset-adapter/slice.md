---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-MARKSET-ADAPTER
  type: slice
  title: The markset-adapter package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-MARKSET-CARRIER]
    dependsOn: [SLICE-CORE]
    informedBy: [ADR-PACKAGE-LAYERS]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/markset-adapter/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/markset-adapter/src/**
      - kind: verification
        path: packages/markset-adapter/test/**
      - kind: documentation
        path: packages/markset-adapter/README.md
    usesResources: []
---

# The markset-adapter package

## Responsibility

The one place Markset is imported (design invariant 8): it reads a record as a Markset document and carries Markset's diagnostics under origin `syntax`.

The slice is the package `@intentset/markset-adapter`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. ADR-PACKAGE-LAYERS records that choice. Its one source file is its entrypoint, so the check has nothing to place in a layer and reports no VSA006. It uses no backend resources.

## Public contract

The exports of `packages/markset-adapter/src/index.ts`, reached by other packages as `@intentset/markset-adapter` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/markset-adapter/test/`. TEST-MARKSET-CARRIER verifies the behavior it implements, BEH-MARKSET-CARRIER, naming the tests whose titles carry the behavior's ID, wherever those tests live; `pnpm run model:evidence` turns a run of them into run records.
