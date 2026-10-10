---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-REVIEW-DRIFT
  type: verification
  title: Review lists slices whose code changed while their records did not
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-REVIEW-DRIFT]
  verification:
    method: automated
    locator: packages/cli/test/checks.test.ts
    selector: BEH-REVIEW-DRIFT
---

# Review lists slices whose code changed while their records did not

## Procedure

`pnpm test` runs these tests with node:test. In a temporary git repository with the worked example, the CLI commits a change to a slice's code with and without its records, and with an `Intentset-Unchanged` trailer, and runs `review --base` with and without `--fail-on-drift`. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/checks.test.ts`: the test "review lists a slice whose code changed while none of its records did, and --fail-on-drift fails on it"
- `packages/cli/test/checks.test.ts`: the test "review lists no drift when a record describing the slice changed with its code, or when nothing it claims as code did"

## Expected result

Every test whose title carries `BEH-REVIEW-DRIFT` passes. A slice whose code changed while none of its records did is listed and `--fail-on-drift` exits 1; a trailer naming it acknowledges it; a change to a record describing the slice, or to nothing it claims as code, lists no drift.
