---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ARCH-BASELINE
  type: verification
  title: A baseline turns known violations into warnings and blocks new ones
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-BASELINE]
  verification:
    method: automated
    locator: packages/architecture/test/units.test.ts
    selector: BEH-ARCH-BASELINE
---

# A baseline turns known violations into warnings and blocks new ones

## Procedure

`pnpm test` runs these tests with node:test. The baseline and exception units are run over hand-built findings, and the CLI test writes a baseline with `--write-baseline` over a tree with a violation and reads it back with `--baseline` in migration and strict mode. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/architecture/test/units.test.ts`: the group "exceptions (VSA §9)"
- `packages/architecture/test/units.test.ts`: the group "baseline (VSA §9)"
- `packages/cli/test/checks.test.ts`: the test "a baseline written by --write-baseline turns known violations into warnings in migration mode only"

## Expected result

Every test whose title carries `BEH-ARCH-BASELINE` passes. In migration mode a baselined violation is a warning, a new one stays an error, an entry no finding matches is reported as stale, and a moved line keeps its fingerprint; strict mode ignores the baseline; a current exception covers its violation with a warning naming it, and an expired or incomplete one is VSA013 and the error stays.
