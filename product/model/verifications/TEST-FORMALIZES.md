---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-FORMALIZES
  type: verification
  title: A formalized requirement is checked for form, never resolved, and carried by the export
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-FORMALIZES]
  verification:
    method: automated
    locator: packages/core/test/formalizes.test.ts
    selector: BEH-FORMALIZES
---

# A formalized requirement is checked for form, never resolved, and carried by the export

## Procedure

`pnpm test` runs these tests with node:test. The core units read `formalizes` from a behavior, a rule and a scenario, refuse it on a capability, report every malformed entry with its pointer and keep the well-formed ones, show that a reference adds no edge and that an address nothing answers validates, compare the content hash before and after a reference is named and renumbered, and carry the entries through the export, sorted, and `readExport`. The cases of `tests/core.json`, `tests/publication.json` and `tests/export.json`, which `pnpm run conformance` and core's own conformance test run, hold one passing case per type, one failing case per condition and the boundary case of one source under two anchors. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/core/test/formalizes.test.ts`: every test, each titled "BEH-FORMALIZES: …"

## Expected result

Every test whose title carries `BEH-FORMALIZES` passes. A reference on a behavior, rule or scenario reads as written; on another type, or malformed, it is CORE001; no edge is added and nothing is fetched; the content hash is the same with and without it; and the export carries the entries sorted by source and then anchor, empty where a record names none.
