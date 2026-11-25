---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-APPROVE
  type: verification
  title: Approve rewrites only the approval, checks first and refuses what it must
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
- The same file: a draft knowledge record gains its review, each source pinned at its content hash, and is current at L4.
- The same file: approving an outcome nothing measures is refused with CORE003 and nothing is written, the other record named with it included; an unknown ID is refused.
- The same file: a bare run, a run without `--by` and a dirty tree are refused; `--allow-dirty` proceeds.

## Expected result

Every test whose title carries `BEH-APPROVE` passes. An approval changes exactly the lines the behavior names, a refused run leaves every file as it was, and nothing is committed.
