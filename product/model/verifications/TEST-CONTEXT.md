---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-CONTEXT
  type: verification
  title: Context returns what an ID or a file promises
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-CONTEXT]
  verification:
    method: automated
    locator: packages/cli/test/cli.test.ts
    selector: BEH-CONTEXT
---

# Context returns what an ID or a file promises

## Procedure

`pnpm test` runs these tests with node:test. The CLI runs `context` on the worked example from a behavior, a rule, a slice, a capability and a claimed file, with and without `--include-restricted`, and on an unknown ID and an unclaimed file; the core units build the bundles directly. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/checks.test.ts`: the test "context of a file a slice claims is that slice's context, and of an unclaimed file a CORE003"
- `packages/cli/test/cli.test.ts`: the test "impact and context of an unknown ID exit 1 with a CORE003"
- `packages/cli/test/cli.test.ts`: the test "context BEH-ASMT-SCHEDULE holds the owning slice, both rules and the rest, each with its path"
- `packages/cli/test/cli.test.ts`: the test "context from a rule, a slice and a capability reaches the same slice; other types get their neighbours"
- `packages/cli/test/cli.test.ts`: the test "context withholds restricted artifacts unless asked, and says how many"
- `packages/core/test/context.test.ts`: the test "a behavior's bundle: owner, rules, scenarios, verifications, contracts, decisions, knowledge, ancestors"
- `packages/core/test/context.test.ts`: the test "restricted artifacts are withheld and counted, unless included"

## Expected result

Every test whose title carries `BEH-CONTEXT` passes. A behavior's context holds its owning slice, rules, scenarios, verifications, contracts, decisions, knowledge and ancestors, each with its path; a rule, slice, capability or claimed file reaches the same slice; restricted artifacts are withheld and counted unless asked for; an unknown ID or an unclaimed file exits 1 with CORE003.
