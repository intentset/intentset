---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-REVIEW-APPROVALS
  type: verification
  title: Review lists a status or approval that differs from the base
  status: draft
  approval:
    at: "2026-11-25"
    basis: direct
    by: "Gary Clarke"
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
  links:
    verifies: [BEH-REVIEW-APPROVALS]
  verification:
    method: automated
    locator: packages/cli/test/approve.test.ts
    selector: BEH-REVIEW-APPROVALS
---

# Review lists a status or approval that differs from the base

## Procedure

`pnpm test` runs this test with node:test. In a temporary git repository with the scheduling example, one rule is approved with `intentset approve`, another has its status moved by hand with no approval, a behavior is edited in a field that is neither, and `review --base` is run as text and as JSON. A second test, once for a base at 0.2 and once at 0.1, migrates the example's records to 0.3 and in the same commit moves one rule's status and edits a behavior, and runs `review --base` against the earlier version. The selector is the behavior's ID, which the test's title carries; `pnpm run model:evidence` reruns the tests and turns the result into run records.

- `packages/cli/test/approve.test.ts`: the test "review lists each record whose status or approval differs from the base"
- `packages/cli/test/approve.test.ts`: the tests "review reads a base at 0.2 as migrated, …" and "… at 0.1 …"
- `packages/cli/test/approve.test.ts`: the test "a review written by hand is listed, though no status or approval changed", and the renewal test of BEH-APPROVE, which lists the renewed review (ADR 0027)
- `packages/cli/test/cli.test.ts`: the tests "a migration that re-pins a matching review lists no review", "a branch that migrates, edits a source and re-pins it lists the review" and "a 0.2 review naming hash: file-v1, migrated and then re-pinned by hand, is listed"

## Expected result

The test passes: the section counts two records, each with its statuses and the approval it states or "no approval stated", the edited behavior is not listed, and `statusChanges` in the JSON holds the same two rows. Against a base at an earlier version, every record is changed and the section lists only the rule whose status moved, as `draft -> approved`, and none as new.
