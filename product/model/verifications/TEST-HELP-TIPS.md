---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-HELP-TIPS
  type: verification
  title: The help file is read and its tips bound to controls
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-HELP-TIPS]
  verification:
    method: automated
    locator: packages/help/test/help.test.ts
    selector: BEH-HELP-TIPS
---

# The help file is read and its tips bound to controls

## Procedure

`pnpm test` runs these tests with node:test. The units read the help file the publisher writes, read files with problems, and bind tips to a stub root that answers querySelectorAll. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/help/test/help.test.ts`: the test "the file the publisher writes reads back, as text and as bytes, and carries the tips"
- `packages/help/test/help.test.ts`: the test "a file with any problem is refused whole, and every problem is named"
- `packages/help/test/help.test.ts`: the test "bindTips puts each tip on its control, keeps an existing title, and reports the IDs with no tip"

## Expected result

Every test whose title carries `BEH-HELP-TIPS` passes. The file reads back as text and as bytes with its tips; a file with any problem is refused whole, each problem named; each tip is bound to the controls marked with its behavior ID, an existing title is kept, and the IDs with no tip are reported.
