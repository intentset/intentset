---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-CONFORMANCE-SUITE
  type: slice
  title: The conformance-suite package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-SUITE-CASES]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/conformance-suite/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/conformance-suite/src/**
      - kind: verification
        path: packages/conformance-suite/test/**
      - kind: documentation
        path: packages/conformance-suite/README.md
    usesResources: []
---

# The conformance-suite package

## Responsibility

The published cases, consumer fixtures and schemas, staged from `tests/`, `spec/` and `examples/` at build time. It has no dependencies.

The slice is the package `@intentset/conformance-suite`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. It uses no backend resources.

## Public contract

The exports of `packages/conformance-suite/src/index.ts`, reached by other packages as `@intentset/conformance-suite` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/conformance-suite/test/`. No verification records yet.
