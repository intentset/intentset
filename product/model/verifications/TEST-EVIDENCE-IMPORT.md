---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-EVIDENCE-IMPORT
  type: verification
  title: Evidence import binds a test report to the commit
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-EVIDENCE-IMPORT]
  verification:
    method: automated
    locator: packages/cli/test/checks.test.ts
    selector: BEH-EVIDENCE-IMPORT
---

# Evidence import binds a test report to the commit

## Procedure

`pnpm test` runs these tests with node:test. In a temporary git repository, the CLI imports a Vitest JSON report and a node:test TAP report, then imports again with an uncommitted change and outside a git repository; the adapter units parse both formats and convert them to run records. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/checks.test.ts`: the test "evidence import binds a Vitest report to the commit, and L3 reads it as a current pass"
- `packages/cli/test/checks.test.ts`: the test "evidence import lists unmatched selectors, reads node:test TAP, and refuses what it must"
- `packages/cli/test/checks.test.ts`: the test "evidence import outside a git repository refuses: evidence must name a commit"
- `packages/verification/test/adapters.test.ts`: the group "parseNodeTap"
- `packages/verification/test/adapters.test.ts`: the group "parseVitestJson"
- `packages/verification/test/adapters.test.ts`: the group "toRunRecords"

## Expected result

Every test whose title carries `BEH-EVIDENCE-IMPORT` passes. The records name the commit and graph hash and read at L3 as a current pass; unmatched selectors are listed; with tracked files changed, or with no commit to name, the import is refused and nothing is written; the records are well formed and the same every time.
