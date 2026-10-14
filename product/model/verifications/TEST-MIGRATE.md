---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-MIGRATE
  type: verification
  title: Migrate rewrites two values per record and refuses a dirty tree
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-MIGRATE]
  verification:
    method: automated
    locator: packages/cli/test/cli.test.ts
    selector: BEH-MIGRATE
---

# Migrate rewrites two values per record and refuses a dirty tree

## Procedure

`pnpm test` runs these tests with node:test. Each makes a temporary git repository from the scheduling example, sets its records back to `0.1`, runs `migrate`, and reads what changed. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests and turns the result into run records.

- `packages/cli/test/cli.test.ts`: the test "migrate --to 0.2 rewrites spec and profile in every record and nothing else, and says how many"
- `packages/cli/test/cli.test.ts`: the test "migrate refuses a tree with uncommitted changes, and a target it does not know, and writes nothing"

## Expected result

Every test whose title carries `BEH-MIGRATE` passes. Each record differs from before in exactly the `spec` and `profile` lines, the count printed is the number of records moved, a second run moves none, and a refused run leaves every file as it was.
