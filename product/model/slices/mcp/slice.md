---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/slice/0.1
  id: SLICE-MCP
  type: slice
  title: The mcp package
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    implements: [BEH-MCP-CONTEXT]
    dependsOn: [SLICE-CORE, SLICE-PUBLISHER]
    informedBy: [ADR-PACKAGE-LAYERS]
  slice:
    kind: product
    domain: toolchain
    entrypoints: [packages/mcp/src/index.ts]
    layers: {}
    claims:
      - kind: source
        path: packages/mcp/src/**
      - kind: verification
        path: packages/mcp/test/**
      - kind: documentation
        path: packages/mcp/README.md
    usesResources: []
---

# The mcp package

## Responsibility

The read-only context server for agents.

The slice is the package `@intentset/mcp`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. ADR-PACKAGE-LAYERS records that choice, and that the check's VSA006 warning about the package's unlayered files stays. It uses no backend resources.

## Public contract

The exports of `packages/mcp/src/index.ts`, reached by other packages as `@intentset/mcp` through the `intentset-source` export condition. No contract record yet.

## Verification

The package's tests under `packages/mcp/test/`. TEST-MCP-CONTEXT verifies the behavior it implements, BEH-MCP-CONTEXT, naming the tests whose titles carry the behavior's ID, wherever those tests live; `pnpm run model:evidence` turns a run of them into run records.
