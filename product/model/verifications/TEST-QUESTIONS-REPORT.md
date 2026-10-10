---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-QUESTIONS-REPORT
  type: verification
  title: The questions report selects its period and fails without access
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-QUESTIONS-REPORT]
  verification:
    method: automated
    locator: amplify/test/questions.test.ts
    selector: BEH-QUESTIONS-REPORT
---

# The questions report selects its period and fails without access

## Procedure

`pnpm test` runs these tests with node:test. The report's selection runs over hand-built stored records, and the command runs with no credentials. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `amplify/test/questions.test.ts`: the test "the window and the excluded prefixes select the records, sorted by time"
- `amplify/test/questions.test.ts`: the test "failure: without credentials the report says so in one line, writes nothing, and exits 1"

## Expected result

Every test whose title carries `BEH-QUESTIONS-REPORT` passes. The window and the excluded conversation prefixes select the records, sorted by time; without credentials the report says so in one line, writes nothing and exits 1. The report's sections, its grouping, the gaps brief, the warning for an `--out` inside the repository and the limit on `--days` are tested in the same file under titles that do not carry this selector.
