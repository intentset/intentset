---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-IMPACT
  type: verification
  title: Impact lists what depends on an artifact
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-IMPACT]
  verification:
    method: automated
    locator: packages/cli/test/cli.test.ts
    selector: BEH-IMPACT
---

# Impact lists what depends on an artifact

## Procedure

`pnpm test` runs these tests with node:test. The CLI runs `impact` on the worked example from a behavior, from a rule and from an unknown ID; the core unit builds the report for a rule change. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/cli.test.ts`: the test "impact BEH-ASMT-SCHEDULE lists the slice, the verification and the knowledge, with snapshot and caveat"
- `packages/cli/test/cli.test.ts`: the test "impact of a rule reaches downstream candidates with multi-step paths"
- `packages/cli/test/cli.test.ts`: the test "impact and context of an unknown ID exit 1 with a CORE003"
- `packages/core/test/impact.test.ts`: the test "a rule change reaches its behavior, verifications and knowledge directly, owners and scenarios beyond"

## Expected result

Every test whose title carries `BEH-IMPACT` passes. The report lists the slice, the verification and the knowledge with the snapshot and the caveat; a rule reaches downstream candidates with multi-step paths, direct apart from candidates; an unknown ID exits 1 with CORE003.
