---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-HELP-READER
  type: verification
  title: servedTo holds all-of, and readHelp reads sorted lists in a closed file
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-HELP-READER]
  verification:
    method: automated
    locator: packages/help/test/help.test.ts
    selector: BEH-HELP-READER
---

# servedTo holds all-of, and readHelp reads sorted lists in a closed file

## Procedure

`pnpm test` runs these tests with node:test. The units read the help file the publisher writes, edit it into each refused form, and test `servedTo` against readers that hold more, less or other than the file names. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/help/test/help.test.ts`: the test "a help file carries no snapshot, and a file with one is refused as a member the table does not give"
- `packages/help/test/help.test.ts`: the test "readHelp reads audience, roles and flags as sorted lists and refuses any other form"
- `packages/help/test/help.test.ts`: the test "readHelp refuses a member the table does not give, at the top, in availability, a knowledge entry or a tip"
- `packages/help/test/help.test.ts`: the test "servedTo holds only for a reader cleared for the projection who holds everything the file names"
- `test/help-file.test.ts`: the test "every help file the publication cases write passes readHelp"

## Expected result

Every test whose title carries `BEH-HELP-READER` passes. `readHelp` accepts sorted, unique lists and refuses a string, an empty audience or role list, an unsorted list, a repeat, a non-string member and any member the table does not give, each with its problem named; `servedTo` is true for a reader who holds everything the file names, more included, and false when one audience, role or flag is missing, one value differs, or the projection is not among the reader's visibilities; every help file the publication cases write passes `readHelp`.
