---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-APPROVAL-BASIS
  type: verification
  title: An approval is shape-checked, left out of the content hash and carried by the export
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-APPROVAL-BASIS]
  verification:
    method: automated
    locator: packages/core/test/approval.test.ts
    selector: BEH-APPROVAL-BASIS
---

# An approval is shape-checked, left out of the content hash and carried by the export

## Procedure

`pnpm test` runs these tests with node:test. The core units read `approval` from a record under each of the three bases, report every malformed block with its pointer, show that a draft of any type may carry one and that an approved record need not, compare the content hash and the whole-file hash before and after an approval is written and changed, and carry the block through the export and `readExport`. The cases of `tests/core.json`, `tests/publication.json` and `tests/export.json`, which `pnpm run conformance` and core's own conformance test run, hold one passing case, one failing case per condition and the boundary cases, and pin literal content hashes of the example's sources before an approval is written. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/core/test/approval.test.ts`: every test, each titled "BEH-APPROVAL-BASIS: …"

## Expected result

Every test whose title carries `BEH-APPROVAL-BASIS` passes. A direct, a derived and an attested approval read as written; each member a basis does not carry is CORE001; a derived approval without a source, or whose source names neither a revision nor a digest, is CORE001; the content hash is the same with and without the block while the whole-file hash differs; and the export carries the block with null where the basis carries no member, which `readExport` holds to the same shape.
