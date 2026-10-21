---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-ARCH-BASELINE-STALE
  type: verification
  title: A baseline entry whose violation is gone is an error
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-BASELINE-STALE]
  verification:
    method: automated
    locator: packages/architecture/test/units.test.ts
    selector: BEH-ARCH-BASELINE-STALE
---

# A baseline entry whose violation is gone is an error

## Procedure

`pnpm test` runs these tests with node:test. The unit tests turn a stale entry into VSA014 with its index, keep VSA014 out of a written baseline, read an entry with or without its message, and compare two baselines: entries matched one for one, an entry moved with a renamed file, and a cycle replaced by a smaller one. The CLI test writes a baseline for the example's missing paths, adds the source tree, and sees four VSA014 errors until `--write-baseline` retires them. The conformance cases of tests/vsa.json whose names start with VSA014 cover migration and strict mode, and are not tagged here. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries.

- `packages/architecture/test/units.test.ts`: the group "a baseline only shrinks (VSA §9)"
- `packages/cli/test/checks.test.ts`: the test "an entry whose violation is gone is VSA014 until the baseline is written again"

## Expected result

Every test whose title carries `BEH-ARCH-BASELINE-STALE` passes.
