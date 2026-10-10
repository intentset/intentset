---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ASK-NOT-IN-DOCS
  type: verification
  title: An uncited answer is kept as not answered
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ASK-NOT-IN-DOCS]
  verification:
    method: automated
    locator: amplify/test/ask.test.ts
    selector: BEH-ASK-NOT-IN-DOCS
---

# An uncited answer is kept as not answered

## Procedure

`pnpm test` runs these tests with node:test. The answer function runs against the in-memory store and a stubbed model that cites nothing. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `amplify/test/ask.test.ts`: the test "an answer that cites nothing is kept as uncited, which is how gaps show"

## Expected result

Every test whose title carries `BEH-ASK-NOT-IN-DOCS` passes. The stored question is marked uncited, which is how gaps in the documentation show.
