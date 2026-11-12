---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ARCH-CHECK
  type: behavior
  title: The architecture check holds the code to its slices
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
  parent: CAP-ARCHITECTURE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC, RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# The architecture check holds the code to its slices

## Behavior

Someone runs `intentset architecture check`. Every in-scope file is resolved to the slice that claims it, every import is resolved, and ownership, entrypoints, cross-slice imports, declared dependencies, cycles, layers and regions are checked (VSA §2 to §5, the profile's TS and AMP rules). A draft slice may plan paths that do not exist yet, unless it or a behavior it implements says its work is built (ADR 0017): then a missing claim or entrypoint is an error, and a draft behavior that says built and that no product slice implements is a warning.

## Preconditions

A model with slices; `.intentset/architecture.yaml` when the repository's layout differs from the reference layout; TypeScript 7, the `typescript` the package resolves as its peer, which is needed only by the checks that read source (this one, validate at L2 and above, review, and a subject-bound evidence read), never by the rest of the toolchain.

## Outcomes

Success: exit 0 with no errors. Failure: each violation is a diagnostic naming the file, the import and the rule, and the command exits 1. An import it cannot resolve is reported, never passed. Where the TypeScript the package resolves is older than 7 or absent, the command stops with a message naming the version found and the command that runs the toolchain with its own TypeScript, and exits 2; `init`, `validate` at L1 and every other command that reads no source still run there.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
