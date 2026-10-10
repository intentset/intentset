---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-READ-EXPORT
  type: verification
  title: readExport refuses an export that breaks the contract
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-READ-EXPORT]
  verification:
    method: automated
    locator: packages/core/test/read-export.test.ts
    selector: BEH-READ-EXPORT
---

# readExport refuses an export that breaks the contract

## Procedure

`pnpm test` runs these tests with node:test. The units read every single-node mutant of the full consumer fixture, bytes, text and values, and exports with a missing or unknown contract; the CLI test reads its own `--report all` export back. The consumer cases of tests/consumer/, run by `packages/conformance/test/consumer.test.ts`, are not tagged here. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/checks.test.ts`: the test "graph --report all at L3 writes every report at the commit, and a consumer's reader accepts it"
- `packages/core/test/read-export.test.ts`: the test "the reader's shape checks agree with spec/export.schema.json on every single-node mutant of full.json"
- `packages/core/test/read-export.test.ts`: the test "bytes, text and parsed values read alike; invalid UTF-8, oversize and truncation are not-json"
- `packages/core/test/read-export.test.ts`: the test "a missing or unknown contract is unsupported-contract before any shape check"
- `packages/core/test/read-export.test.ts`: the test "problems come back ordered by category, the first naming the result"

## Expected result

Every test whose title carries `BEH-READ-EXPORT` passes. The reader's shape checks agree with spec/export.schema.json on every mutant; invalid UTF-8, oversize and truncated input are not-json; a missing or unknown contract is unsupported-contract before any shape check; problems come back ordered by category; the CLI's own export is accepted.
