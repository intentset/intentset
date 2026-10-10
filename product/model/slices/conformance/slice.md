---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-CONFORMANCE
  type: slice
  title: The conformance package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    dependsOn: [SLICE-CORE, SLICE-MARKSET-ADAPTER, SLICE-ARCHITECTURE, SLICE-VERIFICATION, SLICE-PUBLISHER]
    informedBy: [ADR-PACKAGE-LAYERS]
  slice:
    kind: technical
    rationale: Test infrastructure for this implementation; it delivers nothing a user of the packages sees.
    domain: toolchain
    entrypoints: [packages/conformance/src/harness.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/conformance/src/**
      - kind: verification
        path: packages/conformance/test/**
    usesResources: []
---

# The conformance package

## Responsibility

The private harness that runs this implementation against the conformance cases and writes the export consumer fixtures. It is not published. Its one export is `harness.ts`, which re-exports what the packages' tests and the suite's staging use: the fixture expansion (`expandCase`, `treeOf`, `REGISTRIES_PATH`, `CONFIG_PATH`, `ParseYaml`), the schema validator (`validateSchema`, `Schema`), `firstMismatch` and the report formatters. Until 2026-10-10 the manifest also exported `./fixtures` and `./schema` and the tests imported its modules directly, the 17 VSA003 errors the architecture baseline held; routing them through the harness retired the baseline.

The slice is the package `@intentset/conformance`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. ADR-PACKAGE-LAYERS records that choice, and that the check's VSA006 warning about the package's unlayered files stays. It uses no backend resources.

## Public contract

The exports of `packages/conformance/src/harness.ts`, reached as `@intentset/conformance`. No contract record yet.

## Verification

The package's tests under `packages/conformance/test/`. It implements no behavior, so no verification record names it; its tests run in `pnpm test` like every package's.
