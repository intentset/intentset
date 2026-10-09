---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-CLI
  type: slice
  title: The cli package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-AGENT-GUIDE, BEH-CONTEXT, BEH-REVIEW-DRIFT]
    dependsOn: [SLICE-CORE, SLICE-MARKSET-ADAPTER, SLICE-ARCHITECTURE, SLICE-VERIFICATION, SLICE-PUBLISHER, SLICE-ATLAS, SLICE-MCP, SLICE-CONFORMANCE-SUITE]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/cli/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/cli/src/**
      - kind: verification
        path: packages/cli/test/**
      - kind: documentation
        path: packages/cli/README.md
    usesResources: []
---

# The cli package

## Responsibility

The `intentset` command: it wires every package into a command, and owns what only the command does: `init` and the agent guide, `context` by file, and `review`'s drift.

The slice is the package `@intentset/cli`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. It uses no backend resources.

## Public contract

The exports of `packages/cli/src/index.ts`, reached by other packages as `@intentset/cli` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/cli/test/`. No verification records yet.
