---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-REVIEW-BASELINE
  type: verification
  title: Review lists the baseline entries the base did not hold
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-REVIEW-BASELINE]
  verification:
    method: automated
    locator: packages/cli/test/checks.test.ts
    selector: BEH-REVIEW-BASELINE
---

# Review lists the baseline entries the base did not hold

## Procedure

`pnpm test` runs this test with node:test. In a git repository, a change lets a second violation in and writes the baseline again; `review --baseline` lists the one entry the base did not hold, in Markdown and JSON, `--fail-on-baseline-growth` exits 1, a base with no copy of the file makes every entry new, and the flag without `--baseline` exits 2. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries.

- `packages/cli/test/checks.test.ts`: the test "review lists the baseline entries the base did not hold, and --fail-on-baseline-growth fails on them"

## Expected result

Every test whose title carries `BEH-REVIEW-BASELINE` passes.
