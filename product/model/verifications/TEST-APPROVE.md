---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-APPROVE
  type: verification
  title: Approve rewrites only the approval, checks first and refuses what it must
  status: draft
  approval:
    at: "2026-11-25"
    basis: direct
    by: "Gary Clarke"
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 5
  links:
    verifies: [BEH-APPROVE]
  verification:
    method: automated
    locator: packages/cli/test/approve.test.ts
    selector: BEH-APPROVE
---

# Approve rewrites only the approval, checks first and refuses what it must

## Procedure

`pnpm test` runs these tests with node:test. Each makes a temporary git repository from the scheduling example, runs `approve`, and reads the files and git's status afterwards. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests and turns the result into run records.

- `packages/cli/test/approve.test.ts`: a named draft gains `status: approved` and a direct approval and differs in no other line; a second run skips it.
- The same file: a selector approves every match, an earlier approval is replaced, and `--dry-run` leaves the tree byte for byte.
- The same file: a draft knowledge record gains its review, `review` with no `hash`, each source pinned at its content hash, and `self` and `gates` (ADR 0027), and is current at L4; an edit to its text afterwards is CORE008 at L4, at `/intentset/review/self`; a review left under the retired extension is replaced, and `extensions` goes with it.
- The same file: approving an outcome nothing measures is refused with CORE012 and nothing is written, the other record named with it included; an unknown ID is refused.
- The same file: a bare run, a run without `--by` and a dirty tree are refused; `--allow-dirty` proceeds.
- The same file: `--renew-review` rewrites only `reviewedBy`, `reviewedAt` and `review` of approved knowledge whose source changed, leaving its status and approval, and the knowledge is current at L4 again, with `review` listing the review and no approval; it takes deprecated knowledge, skips a draft rule and a knowledge draft, and `--dry-run` writes nothing; a bare run, a run without `--by` and a dirty tree are refused, and `--allow-dirty` proceeds.

## Expected result

Every test whose title carries `BEH-APPROVE` passes. An approval, or a renewed review, changes exactly the lines the behavior names, a refused run leaves every file as it was, and nothing is committed.
