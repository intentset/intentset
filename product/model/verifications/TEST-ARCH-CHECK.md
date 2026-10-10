---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ARCH-CHECK
  type: verification
  title: The architecture check holds code to its slices
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-CHECK]
  verification:
    method: automated
    locator: packages/cli/test/checks.test.ts
    selector: BEH-ARCH-CHECK
---

# The architecture check holds code to its slices

## Procedure

`pnpm test` runs these tests with node:test. The CLI runs `architecture check` on the worked example with and without its source tree, and on a tree with a deep import into another slice; the unit test runs the check over a tree with an import it cannot resolve. The conformance cases of tests/vsa.json, run by `packages/architecture/test/fixtures.test.ts`, cover each VSA and profile rule and are not tagged here. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/architecture/test/units.test.ts`: the test "unresolved lists what could not be checked, with a TS004 warning beside it"
- `packages/cli/test/checks.test.ts`: the test "architecture check on the example with its source tree is clean at L2, and says what it did not check"
- `packages/cli/test/checks.test.ts`: the test "architecture check without the source tree: a draft slice's paths are planned, an approved slice's are missing"
- `packages/cli/test/checks.test.ts`: the test "a deep import into another slice's internals is VSA003 and exits 1"

## Expected result

Every test whose title carries `BEH-ARCH-CHECK` passes. The example is clean at L2 and the output lists what was not checked; a draft slice's missing paths read as planned and an approved slice's as missing; a deep import is VSA003 and exits 1; an unresolvable import is listed as unresolved with a TS004 warning, never passed.
