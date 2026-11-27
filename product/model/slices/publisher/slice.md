---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/slice/0.3
  id: SLICE-PUBLISHER
  type: slice
  title: The publisher package
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
  links:
    implements: [BEH-PUBLISH, BEH-REVIEW-PINS, BEH-PUBLISH-FRAGMENT, BEH-PUBLISH-READER, BEH-PUBLISH-UNDER-REVIEW, BEH-PUBLISH-SURFACES]
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

The exports of `packages/publisher/src/index.ts`, reached by other packages as `@intentset/publisher` through the `intentset-source` export condition. A request is for one reader, its audience and role each a value or a list, and `checkRequest` turns it into a `CheckedRequest` with sorted lists; `audienceReason` and `availabilityReason` are the dimension tests every stage uses; the index names `PUBLICATION_INDEX_PROFILE` first (ADR 0029). A request may name `keepUnderReview`, and `publish` returns documents kept under review in `keptUnderReview`, apart from `documents`, with `reviewStatus` saying whether knowledge is keepable and `reviewGateHash` what `review.gates` pins (ADR 0027). The help file carries `surfaces`, which `helpSurfaces` computes, and `publish` returns the slices the projection admits whose surfaces it left out in `omittedSurfaces`, with an `OmissionReason` each (ADR 0028). No contract record yet.

## Verification

The package's tests under `packages/publisher/test/`. TEST-PUBLISH verifies BEH-PUBLISH, TEST-REVIEW-PINS verifies BEH-REVIEW-PINS, TEST-PUBLISH-FRAGMENT verifies BEH-PUBLISH-FRAGMENT, TEST-PUBLISH-READER verifies BEH-PUBLISH-READER, TEST-PUBLISH-UNDER-REVIEW verifies BEH-PUBLISH-UNDER-REVIEW and TEST-PUBLISH-SURFACES verifies BEH-PUBLISH-SURFACES, each naming the tests whose titles carry its behavior's ID, wherever those tests live; `pnpm run model:evidence` turns a run of them into run records.
