---
markset: 0
---

# Build the connections before building more workflow.

{.lead}
The first goal is practical: take one real product behavior from readable source to implementation ownership, current evidence, and reviewed knowledge.

## Available in this draft

Core and architecture specifications, a TypeScript + Amplify profile, a publication profile, an export contract, a worked model, an adoption roadmap, and the 0.3 reference toolchain on npm, with a conformance suite other implementations can use.

## Delivered in 0.1: validate the model

Safe parsing, typed relationships, stable diagnostics, and independent conformance fixtures.

## Delivered in 0.1: connect the repository

Slice ownership and contracts resolved against the code, test evidence collected per snapshot, and the impact of a change explained.

## Delivered in 0.1: help people and agents review

A Product Atlas, reviewed Markset publication, and bounded agent context over a read-only MCP server.

## Delivered in 0.2: tools that read the model

The [export contract](../specifications/export/index.html) fixes what a repository hands to other tools: the graph, with evidence, knowledge, impact and ownership reports, restricted records withheld and counted, and fixtures for testing a consumer. A product can be modelled before its code: while a slice is a draft, the paths it plans are warnings.

## Delivered in 0.3: backends past CloudFormation's limits

The reference profile's [areas](../specifications/profile-typescript-amplify-gen2/index.html#{{profileAreasSection}}) split an Amplify backend that outgrows one CloudFormation deployment into several behind one AppSync Merged API, and the architecture check keeps each slice, schema and import inside its area. The rules come from a production application that made the split, and from Streamlane, which reached the limit.

## Next: Streamlane and Driftline read the model

Streamlane will import the export to link work items to the behaviors they change. Driftline is built with Intentset from its first commit, and will attribute usage and errors to slices and behaviors.

## Then: a second pilot and a stable 1.0

The first pilot, on Streamlane, changed the specification in four places. A second pilot on a different codebase decides what 1.0 keeps.

## Bring a real example

The most useful early feedback is a capability that is difficult to model, a boundary that is hard to enforce, or an explanation that is hard to publish safely.

[[Read the original implementation roadmap](implementation/index.html)]{.button .primary} [[Contribute on GitHub]({{repo}})]{.button}
