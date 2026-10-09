---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-PUBLISHER
  type: slice
  title: The publisher package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-PUBLISH]
    dependsOn: [SLICE-CORE, SLICE-MARKSET-ADAPTER]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/publisher/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/publisher/src/**
      - kind: verification
        path: packages/publisher/test/**
      - kind: documentation
        path: packages/publisher/README.md
    usesResources: []
---

# The publisher package

## Responsibility

The projection of knowledge for a request, the generated Markset and the help file (spec/publication.md).

The slice is the package `@intentset/publisher`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. It uses no backend resources.

## Public contract

The exports of `packages/publisher/src/index.ts`, reached by other packages as `@intentset/publisher` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/publisher/test/`. No verification records yet.
