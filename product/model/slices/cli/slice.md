---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/slice/0.3
  id: SLICE-CLI
  type: slice
  title: The cli package
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 4
  links:
    implements: [BEH-AGENT-GUIDE, BEH-CONTEXT, BEH-MIGRATE, BEH-APPROVE, BEH-REVIEW-DRIFT, BEH-REVIEW-BASELINE, BEH-REVIEW-APPROVALS, BEH-REVIEW-SURFACES]
    dependsOn: [SLICE-CORE, SLICE-MARKSET-ADAPTER, SLICE-ARCHITECTURE, SLICE-VERIFICATION, SLICE-PUBLISHER, SLICE-ATLAS, SLICE-MCP, SLICE-CONFORMANCE-SUITE]
    informedBy: [ADR-PACKAGE-LAYERS]
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

The `intentset` command: it wires every package into a command, and owns what only the command does: `init` and the agent guide, `context` by file, `migrate` between specification versions, `approve`, which writes a person's approval into drafts, `review`'s drift, its list of approvals and status changes and its list of surface changes, the `evidence stale` command's table, JSON and exit codes (what it selects and the runner arguments it prints are the verification package's, BEH-EVIDENCE-STALE), and the `list` command's options, table and exit codes (what a selector matches and the result it writes are core's, BEH-LIST).

The slice is the package `@intentset/cli`. Its layers are empty: a package is a library with one public surface, its entrypoint, and the profile's layer matrix (presentation, application, policy, model, external) does not describe it. ADR-PACKAGE-LAYERS records that choice, and that the check's VSA006 warning about the package's unlayered files stays. It uses no backend resources.

## Public contract

The exports of `packages/cli/src/index.ts`, reached by other packages as `@intentset/cli` through the `intentset-source` export condition, and the `intentset` command. `publish` and `mcp --mode customer` take `--audience` and `--role` repeatedly for a reader who holds more than one, never splitting a value on commas, and the summary names the sets (ADR 0029). `publish --keep-under-review` writes documents kept under review under `under-review/`; `approve` writes a knowledge review's `self` and `gates`; `review` lists knowledge whose review changed beside approvals, leaving out exactly a migration's re-pins; and `migrate` re-pins a `self` that matched, from a version that read it, and leaves a `0.2` review extension's `self` and `gates` out of `review` (ADR 0027). `publish` prints, after the files it wrote and into none of them, each slice the projection admits whose surfaces it left out, with the reason; `review` lists the surfaces a change adds, removes or re-leads on a slice past draft, in a section and in `surfaceChanges` (ADR 0028). No contract record yet.

## Verification

The package's tests under `packages/cli/test/`. The verification records of the behaviors it implements are TEST-AGENT-GUIDE (BEH-AGENT-GUIDE), TEST-CONTEXT (BEH-CONTEXT), TEST-MIGRATE (BEH-MIGRATE), TEST-APPROVE (BEH-APPROVE), TEST-REVIEW-DRIFT (BEH-REVIEW-DRIFT), TEST-REVIEW-BASELINE (BEH-REVIEW-BASELINE), TEST-REVIEW-APPROVALS (BEH-REVIEW-APPROVALS) and TEST-REVIEW-SURFACES (BEH-REVIEW-SURFACES). The omission lines of `publish` are checked by TEST-PUBLISH-SURFACES. Each names the tests whose titles carry the behavior's ID, wherever those tests live; `pnpm run model:evidence` turns a run of them into run records.
