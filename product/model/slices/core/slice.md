---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/slice/0.3
  id: SLICE-CORE
  type: slice
  title: The core package
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 4
  links:
    implements: [BEH-VALIDATE-REPORTS, BEH-IMPACT, BEH-EXPORT, BEH-READ-EXPORT, BEH-LIST, BEH-DELIVERY, BEH-APPROVAL-BASIS, BEH-FORMALIZES, BEH-SURFACES]
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

The carrier reader, the types, the graph, the validator, impact and the export, `readExport` for consumers, and `select`, the closed selector `intentset list` and consumers read records with (spec/list.md), with the slice definitions it shares with `review` and `context`, `deliveryOf`, a record's effective delivery (Core §7), and the readers of `approval`, the basis of a record's approval, and `formalizes`, the outside requirement it formalizes (Core §7, §5; ADR 0020). It has no dependencies (design invariant 8), which `dependsOn` being empty states and the architecture check holds.

The slice is the package `@intentset/core`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. ADR-PACKAGE-LAYERS records that choice, and that the check's VSA006 warning about the package's unlayered files stays. It uses no backend resources.

## Public contract

The exports of `packages/core/src/index.ts`, reached by other packages as `@intentset/core` through the `intentset-source` export condition. A knowledge review's `self` and `gates` are read as strings, CORE001 at `/intentset/review/self` and `/intentset/review/gates` otherwise; every artifact carries `ownContentHash`, and `ownContentHashOf` and `gateHashOf` compute what the two pin; the export's `reports.knowledge` entries carry `self`, and its exported `review` never carries `self` or `gates` (ADR 0027). A slice's `surfaces` is read and checked (CORE001, CORE003, CORE005, CORE013), `isSurfaceId`, `SURFACE_ID_PATTERN` and `SURFACE_ID_DIGITS` state the key rules, the YAML reader refuses a `__proto__` key (CORE010), and the export's slices carry `surfaces` (ADR 0028). No contract record yet.

## Verification

The package's tests under `packages/core/test/`. The verification records of the behaviors it implements are TEST-VALIDATE-REPORTS (BEH-VALIDATE-REPORTS), TEST-IMPACT (BEH-IMPACT), TEST-EXPORT (BEH-EXPORT), TEST-READ-EXPORT (BEH-READ-EXPORT), TEST-LIST (BEH-LIST), TEST-DELIVERY (BEH-DELIVERY), TEST-APPROVAL-BASIS (BEH-APPROVAL-BASIS), TEST-FORMALIZES (BEH-FORMALIZES) and TEST-SURFACES (BEH-SURFACES). Each names the tests whose titles carry the behavior's ID, wherever those tests live; `pnpm run model:evidence` turns a run of them into run records.
