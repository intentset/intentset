---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-EVIDENCE-CURRENT
  type: verification
  title: Only a pass at the assessed snapshot counts
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-EVIDENCE-CURRENT]
  verification:
    method: automated
    locator: packages/verification/test/classify.test.ts
    selector: BEH-EVIDENCE-CURRENT
---

# Only a pass at the assessed snapshot counts

## Procedure

`pnpm test` runs these tests with node:test. The classification and coverage units are run over hand-built run records at, and away from, the assessed commit and graph hash; the CLI tests import a report and validate at L3. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/checks.test.ts`: the test "evidence import binds a Vitest report to the commit, and L3 reads it as a current pass"
- `packages/cli/test/checks.test.ts`: the test "at L3 an approved behavior without a current pass is CORE007"
- `packages/verification/test/check.test.ts`: the group "coverage"
- `packages/verification/test/classify.test.ts`: the group "classifyEvidence"

## Expected result

Every test whose title carries `BEH-EVIDENCE-CURRENT` passes. Only a pass at both the commit and the graph hash is current; a stale failure is stale, a failure at the snapshot stays visible after an older pass, and a record still carrying `@current` is unresolved, never current; link coverage and current-pass coverage are counted apart, with snapshot and denominator, and never as a percentage; at L3 an approved behavior without a current pass is CORE007.
