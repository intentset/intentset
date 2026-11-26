---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-MIGRATE
  type: verification
  title: Migrate rewrites what the move requires and refuses a dirty tree
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  links:
    verifies: [BEH-MIGRATE]
  verification:
    method: automated
    locator: packages/cli/test/cli.test.ts
    selector: BEH-MIGRATE
---

# Migrate rewrites what the move requires and refuses a dirty tree

## Procedure

`pnpm test` runs these tests with node:test. Each makes a temporary git repository from the scheduling example, sets its records back to `0.2` or `0.1`, runs `migrate`, and reads what changed. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests and turns the result into run records.

- `packages/cli/test/cli.test.ts`: the tests "migrate --to 0.3 rewrites spec and profile from 0.2 (and from 0.1) in every record and nothing else, and says how many"
- `packages/cli/test/cli.test.ts`: the tests "migrate --to 0.3 from 0.2 (and from 0.1) rewrites implemented and released to approved, with delivery built where the type carries it and states none", over a capability, a behavior and a slice that state no delivery, a rule that states one, an outcome, an intent and a decision, which never carry it, and a deprecated rule
- `packages/cli/test/cli.test.ts`: the test "migrate reads past a comment line inside the intentset mapping, at column 0 or indented", with a column-0 comment before `status`, another before `type`, an indented one before `status` and a column-0 one before `spec`
- `packages/cli/test/cli.test.ts`: the test "migrate names a record whose status it could not rewrite, does not count it as moved, and exits 1", over a status written as a double-quoted escape
- `packages/cli/test/cli.test.ts`: the test "migrate refuses a tree with uncommitted changes, and a target it does not know, and writes nothing"

## Expected result

Every test whose title carries `BEH-MIGRATE` passes. A record whose status `0.3` still lists differs from before in exactly the `spec` and `profile` lines; one at `implemented` or `released` is `approved`, with `delivery: built` on the next line only where its type carries delivery and it stated none, and validates with no CORE001; a comment line inside the mapping changes none of that; the count printed is the number of records moved, a record still declaring a removed status is named and not counted, a second run moves none, and a refused run leaves every file as it was.
