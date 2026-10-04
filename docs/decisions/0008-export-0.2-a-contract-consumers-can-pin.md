# ADR 0008: Export 0.2 is the first contract a consumer may pin: typed reports, restricted withheld, a reader in core

**Status:** accepted, 2026-10-03

## Context

The integration contract asks for an export envelope a consumer can pin, optional report sections for evidence,
knowledge review and impact, and shared valid and invalid fixtures before any consumer ships. The 0.1 envelope had the
graph but left `reports` as three untyped slots nothing filled, exported restricted artifacts by default, and came with
no fixtures for a consumer. Two consumers are now planned: Streamlane, which links work items to behaviors and shows
their evidence, and Driftline, which attributes errors and usage to slices and behaviors and needs a file-to-slice map
the envelope did not carry. Neither has built anything yet.

## Decision

- The contract becomes `intentset/export/0.2` (spec/export.md). Typing the reports, adding `withholding`,
  `source.uncommitted` and `withheldLinks` would make every 0.2 envelope invalid under the 0.1 schema, whose objects
  are closed, so the version moves rather than the meaning of 0.1 changing under it. Nothing reads 0.1.
- Four reports, each built by the package that owns the check: evidence (`@intentset/verification`), knowledge
  (`@intentset/publisher`), impact (`@intentset/core`) and ownership (`@intentset/architecture`, new). Core defines
  their types, so it depends on none of them, and `exportGraph` takes them ready-made.
- Restricted artifacts are withheld by default, as they already were from agent context and the MCP server, and every
  omission is counted where it happened. The graph hash still covers them, because evidence is bound to the snapshot,
  not to the projection.
- `readExport` in `@intentset/core`, which has no dependencies, makes every check a consumer must, so a JavaScript
  consumer imports one function rather than reimplementing them. Its shape checks are typed code mirroring the schema
  (ADR 0002), and a test compares the two on a few thousand single-node mutants of a real envelope.
- The consumer fixtures are generated from the worked example by `npm run fixtures:consumer`, committed under
  `tests/consumer/`, and published in `@intentset/conformance-suite`. A test fails when the committed copy differs
  from what the recipe builds.

## Consequences

- The CLI's `graph` output changes shape and default content. Within 0.x and with no consumer, that is the cheapest
  moment to make the change; after a consumer pins 0.2, any change a 0.2 reader would reject is 0.3.
- Impact is computed from every exported artifact, which grows with the graph. At the sizes in view (tens to a few
  hundred records) the report is small; a producer may later take a list of starts.
- Ownership lists every attributed file, which for a large repository is the largest section. It is optional, and
  only consumers that map files to slices need it.
- Bodies and extensions are exported as authored. A withheld ID mentioned in the prose of a non-restricted record is
  not redacted: that is the author's to avoid, as it is for publication.
