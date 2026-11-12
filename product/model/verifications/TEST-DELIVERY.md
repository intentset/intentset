---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-DELIVERY
  type: verification
  title: Delivery is read beside the status, and what contradicts it is reported
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-DELIVERY]
  verification:
    method: automated
    locator: packages/core/test/delivery.test.ts
    selector: BEH-DELIVERY
---

# Delivery is read beside the status, and what contradicts it is reported

## Procedure

`pnpm test` runs these tests with node:test. The core units read `delivery` from a record, compute the effective delivery from the field and the status, report each contradiction, and carry the field through the export and `readExport`. What validation, the architecture check, publication and `list` do with it is held by the cases in `tests/core.json`, `tests/vsa.json`, `tests/publication.json`, `tests/list.json` and `tests/export.json`, which `pnpm run conformance` and core's own conformance test run. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/core/test/delivery.test.ts`: every test, each titled "BEH-DELIVERY: …"
- `packages/cli/test/list.test.ts`: the test titled "BEH-LIST, BEH-DELIVERY: …", for `--delivery`

## Expected result

Every test whose title carries `BEH-DELIVERY` passes. `delivery` on a type that does not carry it, or with another value, is CORE001; an implemented record with no field is built and an approved one is not stated; planned with an implementing status is CORE005, as is a built behavior with a planned slice; a draft built behavior with no slice is a CORE006 warning at L2; and the export carries the field as written, which `readExport` refuses on a type that does not carry it.
