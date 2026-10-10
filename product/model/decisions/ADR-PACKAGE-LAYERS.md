---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/decision/0.1
  id: ADR-PACKAGE-LAYERS
  type: decision
  title: A package slice declares no layers, and its VSA006 warning stays
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# A package slice declares no layers, and its VSA006 warning stays

## Context

Each package under `packages/` is one slice, with `layers: {}`. VSA006 (VSA §2, the profile's §3 layer matrix) checks
the imports inside a slice against the layers it declares: presentation, application, policy, model and external, the
roles of a feature in an application (screens and hooks, use-cases, policies, models, the client that reaches the
backend). A slice that declares none falls back to the reference layout's folders under its entrypoint (`client/`,
`domain/policies/`, `domain/models/`). The packages have neither, so the architecture check warns once per package
slice with more than its entrypoint (architecture, atlas, cli, conformance, core, mcp, publisher, verification): their
files are in no layer, and their imports were not layer-checked.

A package's modules are not arranged in those roles. Core's reader, graph, validator and export call one another
as one library; the CLI's commands read files, run checks and print in one module each. Declaring layers would mean
choosing a role for each module that describes nothing about how the package was designed, and then either moving
code to satisfy a matrix written for features in an app or choosing the assignment that happens to pass, which is a
layer check that checks nothing.

## Decision

The package slices keep `layers: {}`, and their Responsibility says why. The VSA006 warnings stay in the check's
output: design invariant 6 says a check reports what it could not check, and this is the accurate statement that a
package's internal imports are not layer-checked. Nothing suppresses them, and no baseline or exception covers them.

What holds the packages instead is checked: each package's one public surface is its entrypoint (VSA003, TS001,
TS002), `dependsOn` mirrors each manifest's dependencies so design invariant 8 is held by the check as well as the
manifests, and there are no cycles between slices (VSA005).

The decision is about the package slices. SLICE-ASK, the chat's backend under `amplify/`, has the shape the matrix
was written for (a handler, its policies, and clients for the model and the store) and is not covered by it: whether
it declares layers is its own slice's decision.

## Consequences

`pnpm run model:validate` reports eight VSA006 warnings today, one per package slice with internal modules, and they
are expected. A package that grows an application's shape, such as a user interface with its own state, declares its
layers then and leaves this decision. If the profile gains a layer vocabulary for libraries, this decision is
revisited.
