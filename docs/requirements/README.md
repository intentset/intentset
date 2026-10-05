# Intentset — repository kickoff requirements

Copy this entire folder to `intentset/docs/requirements/`. It is self-contained. No current repository implementation was inspected for this handoff.

## Read in order

1. [Kickoff scope and acceptance](00-kickoff.md)
2. [Core specification](specs/01-core-specification.md)
3. [Traceable VSA specification](specs/02-traceable-vsa-specification.md)
4. [TypeScript + Amplify Gen 2 profile](profiles/03-typescript-amplify-gen2.md)
5. [Implementation roadmap](roadmap/05-implementation-roadmap.md)
6. [Public-site requirements and complete copy](site/06-intentset-information-architecture-and-copy.md)
7. [Responsive site wireframes](wireframes/intentset.html)

Implementation aids: [example](examples/README.md), [schema](schemas/frontmatter.schema.json), [acceptance fixtures](conformance/fixture-catalog.md), [cross-project contract](integration-contract.md).

[Provenance](SOURCES.md) and [validation limits](VALIDATION.md) identify remaining uncertainties. The roadmap describes planned tools, not delivered software. The page named `wireframes/markset.html` explains Intentset's Markset integration; it is not the Markset project website.

**Since 2026-10-02 the normative documents live in [`spec/`](../../spec/)** and the example in
[`examples/scheduling/`](../../examples/scheduling/). This folder is the kickoff handoff as delivered and is not
updated when the specification changes; `spec/` is the source of truth.

**Since 2026-10-05 [`markset/`](markset/README.md)** holds the half of the kickoff delivered to Markset (its
integration requirements MKS-001 to MKS-008, the profile adapter contract and its backlog), moved here from Markset's
`docs/expansion-requirements/` so that Intentset keeps the one copy. The shared contract it links is
[`integration-contract.md`](integration-contract.md), which the two handoffs carried identically.
