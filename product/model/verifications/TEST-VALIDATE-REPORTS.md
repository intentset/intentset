---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-VALIDATE-REPORTS
  type: verification
  title: Validate reports every problem as a sorted diagnostic
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-VALIDATE-REPORTS]
  verification:
    method: automated
    locator: packages/cli/test/cli.test.ts
    selector: BEH-VALIDATE-REPORTS
---

# Validate reports every problem as a sorted diagnostic

## Procedure

`pnpm test` runs these tests with node:test. The CLI validates a repository with a broken record, with `--json`, with no configuration and with invalid invocations; the core units validate the worked example in every file order and check each diagnostic's shape. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/cli.test.ts`: the test "a broken record exits 1 with its code, location, artifact, fix and field"
- `packages/cli/test/cli.test.ts`: the test "no configuration anywhere above exits 2 and names init"
- `packages/cli/test/cli.test.ts`: the test "invocation errors exit 2 before reading anything"
- `packages/cli/test/cli.test.ts`: the test "validate --json parses, counts warnings apart from errors, and is the same bytes twice"
- `packages/core/test/validate.test.ts`: the test "diagnostics are sorted and identical whatever order the files arrive in"
- `packages/core/test/validate.test.ts`: the test "every diagnostic has the contract's shape: one-sentence message and remediation"

## Expected result

Every test whose title carries `BEH-VALIDATE-REPORTS` passes. A broken record exits 1 with its code, location, artifact, fix and field; `--json` counts warnings apart from errors and is the same bytes twice; diagnostics are sorted and identical whatever order the files arrive in, each with a one-sentence message and remediation; no configuration, or a wrong invocation, exits 2, naming `init` where there is no configuration.
