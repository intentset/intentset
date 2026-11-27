---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-HELP-TIPS
  type: verification
  title: The help file is read and its tips bound to controls
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
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
- `packages/help/test/help.test.ts`: the test "bindTips puts each tip on its control as data, sets no title, and reports the IDs with no tip"
- `packages/help/test/help.test.ts`: the test "a file with help under review is read, and its marks must agree", over the example published with its knowledge kept under review (ADR 0027): its entry and behavior tip marked, its rule tip held back in `withheldForReview`, and a mark missing, false, outside `under-review/` or shared with a tip's key refused
- `packages/help/test/help.test.ts`: the test "help under review is left out by default and returned marked under include, never counted missing", over `reviewStateFor`, `tipFor`, `articles`, `helpForPage` and `bindTips` in both modes, `data-help-under-review` set under `include` and nothing removed under `exclude`

## Expected result

Every test whose title carries `BEH-HELP-TIPS` passes. The file reads back as text and as bytes with its tips; a file with any problem is refused whole, each problem named; each tip is bound to the controls marked with its behavior ID as `data-help-tip` and `data-help-knowledge`, no `title` is set and an existing one is left alone, and the IDs with no tip are reported.
