# ADR 0009: Areas, for an Amplify backend too large for one CloudFormation deployment

**Status:** accepted, 2026-10-04

## Context

The TypeScript + Amplify Gen 2 profile assumed one backend: one `amplify/backend.ts`, one `data/resource.ts`. Amplify
deploys a backend as one CloudFormation root stack with nested stacks, and CloudFormation caps a stack at 500
resources and a deployment at 2,500 across its nested stacks. Gen 2 generates about 16 resources per model, and gives
no supported way to choose which nested stack they land in. A production application on this profile's architecture
reached the 2,500 limit and split its backend into four areas behind an AppSync Merged API, which it has run in
production since. Streamlane, still on one backend, reached 510 resources in one nested stack at 85 custom operations.
The profile said nothing about either.

## Decision

The profile gains §9, Areas. A repository MAY split its backend into areas: each an Amplify backend with its own schema
and CloudFormation deployment, joined by one Merged API that the frontend reaches through one client. Once a repository
declares areas in `.intentset/architecture.yaml` (`areas`, `sharedBackend`, `schemaBridge`), seven rules apply:

- AMP007 to AMP011 are checked from source: a slice's `domain` names its area and its claims stay there; area backends
  do not import each other and the shared backend package imports none; each model, enum and operation has one
  owning schema (a custom type in two is a warning); no relationship or reference crosses areas; only the schema
  bridge calls `generateClient` and imports area schemas, type-only.
- AMP012 (cross-area data through published names and the SDK, and an acyclic deploy order) and AMP013 (one
  authorizer on the Merged API, failing closed) are review assertions, listed in every area repository's report.

The rules are the ones the production application already enforces with dependency-cruiser and a merge script. Run
against its tree with its four areas declared, the checker read all four schemas without a problem (65 models, 48
queries, 18 mutations, 100 custom types, 139 references) and found nothing under AMP007 to AMP011.

## Consequences

- One-backend repositories are untouched: none of the new rules runs without `areas`.
- An area's backend counts as backend for AMP001, AMP002 and AMP004, so its functions need an owner as before.
- Schema declarations are read from TypeScript's tokens, like imports. A spread or a member whose kind cannot be read
  is listed as not checked, never passed.
- Spreading one backend over more nested stacks (Streamlane's spike) buys time against the 500-per-stack limit but
  meets the 200-parameter and 1 MB template limits; the profile calls it a stopgap.
