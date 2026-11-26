---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/slice/0.2
  id: SLICE-PUBLISHER
  type: slice
  title: The publisher package
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
  links:
    implements: [BEH-PUBLISH, BEH-REVIEW-PINS, BEH-PUBLISH-FRAGMENT]
    dependsOn: [SLICE-CORE, SLICE-MARKSET-ADAPTER]
    informedBy: [ADR-PACKAGE-LAYERS]
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

The projection of knowledge for a request, the generated Markset, its HTML as a page or a fragment, and the help file (spec/publication.md).

The slice is the package `@intentset/publisher`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. ADR-PACKAGE-LAYERS records that choice, and that the check's VSA006 warning about the package's unlayered files stays. It uses no backend resources.

## Public contract

The exports of `packages/publisher/src/index.ts`, reached by other packages as `@intentset/publisher` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/publisher/test/`. TEST-PUBLISH verifies BEH-PUBLISH, TEST-REVIEW-PINS verifies BEH-REVIEW-PINS and TEST-PUBLISH-FRAGMENT verifies BEH-PUBLISH-FRAGMENT, each naming the tests whose titles carry its behavior's ID, wherever those tests live; `pnpm run model:evidence` turns a run of them into run records.
