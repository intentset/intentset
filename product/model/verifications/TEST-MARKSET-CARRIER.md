---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-MARKSET-CARRIER
  type: verification
  title: Records are read as Markset with Markset's own diagnostics
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-MARKSET-CARRIER]
  verification:
    method: automated
    locator: packages/markset-adapter/test/adapter.test.ts
    selector: BEH-MARKSET-CARRIER
---

# Records are read as Markset with Markset's own diagnostics

## Procedure

`pnpm test` runs these tests with node:test. The adapter units read documents through the Markset carrier and the plain carrier; the CLI validates the worked example with each carrier and a record with a Markset problem; the core unit passes a carrier's syntax diagnostics through validation. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/cli.test.ts`: the test "Markset's own diagnostics are marked as Markset's in text and keep origin syntax in JSON"
- `packages/cli/test/cli.test.ts`: the test "--carrier plain and markset give identical validate output on the example"
- `packages/core/test/validate.test.ts`: the test "syntax diagnostics from the carrier pass through with their origin"
- `packages/markset-adapter/test/adapter.test.ts`: the test "frontmatter, headings and syntax diagnostics come out in the shared shape"
- `packages/markset-adapter/test/adapter.test.ts`: the test "marksetCarrier and plainCarrier agree on every example document"

## Expected result

Every test whose title carries `BEH-MARKSET-CARRIER` passes. Both carriers give the same frontmatter and headings for every example document and identical validate output; a Markset problem keeps origin `syntax` and Markset's own code in JSON and is marked as Markset's in text.
