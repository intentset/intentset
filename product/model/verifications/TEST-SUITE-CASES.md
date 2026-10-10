---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-SUITE-CASES
  type: verification
  title: The conformance suite package ships the cases as data
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-SUITE-CASES]
  verification:
    method: automated
    locator: packages/conformance-suite/test/suite.test.ts
    selector: BEH-SUITE-CASES
---

# The conformance suite package ships the cases as data

## Procedure

`pnpm test` runs these tests with node:test. The tests stage the suite into a temporary directory and read the package's manifest. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/conformance-suite/test/suite.test.ts`: the test "staging expands every case into whole files that still satisfy the schema"
- `packages/conformance-suite/test/suite.test.ts`: the test "the package ships the data, reachable by path, and depends on nothing"

## Expected result

Every test whose title carries `BEH-SUITE-CASES` passes. Every section is staged and every case expanded into whole files that still satisfy the conformance schema; the manifest ships the cases, the schemas and the example, reachable by path, stages them before packing, and declares no dependencies.
