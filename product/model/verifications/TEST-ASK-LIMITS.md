---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ASK-LIMITS
  type: verification
  title: The chat refuses past its limits without a model call
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ASK-LIMITS]
  verification:
    method: automated
    locator: amplify/test/ask.test.ts
    selector: BEH-ASK-LIMITS
---

# The chat refuses past its limits without a model call

## Procedure

`pnpm test` runs these tests with node:test. The answer function runs against the in-memory store and a stubbed model with each limit reached in turn: too long, too many turns, malformed, switched off, over budget and over the visitor's limit. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `amplify/test/ask.test.ts`: the test "too long, too many turns, malformed, switched off, over budget and over the visitor's limit cost no model call and keep nothing"

## Expected result

Every test whose title carries `BEH-ASK-LIMITS` passes. Each is refused, none calls the model, and nothing is kept.
