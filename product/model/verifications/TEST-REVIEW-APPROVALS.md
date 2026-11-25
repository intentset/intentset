---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-REVIEW-APPROVALS
  type: verification
  title: Review lists a status or approval that differs from the base
  status: approved
  approval:
    at: "2026-11-25"
    basis: direct
    by: "Gary Clarke"
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-REVIEW-APPROVALS]
  verification:
    method: automated
    locator: packages/cli/test/approve.test.ts
    selector: BEH-REVIEW-APPROVALS
---

# Review lists a status or approval that differs from the base

## Procedure

`pnpm test` runs this test with node:test. In a temporary git repository with the scheduling example, one rule is approved with `intentset approve`, another has its status moved by hand with no approval, a behavior is edited in a field that is neither, and `review --base` is run as text and as JSON. The selector is the behavior's ID, which the test's title carries; `pnpm run model:evidence` reruns the tests and turns the result into run records.

- `packages/cli/test/approve.test.ts`: the test "review lists each record whose status or approval differs from the base"

## Expected result

The test passes: the section counts two records, each with its statuses and the approval it states or "no approval stated", the edited behavior is not listed, and `statusChanges` in the JSON holds the same two rows.
