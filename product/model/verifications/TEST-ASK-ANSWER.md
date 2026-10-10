---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ASK-ANSWER
  type: verification
  title: The chat streams an answer with its sources
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ASK-ANSWER]
  verification:
    method: automated
    locator: amplify/test/ask.test.ts
    selector: BEH-ASK-ANSWER
---

# The chat streams an answer with its sources

## Procedure

`pnpm test` runs these tests with node:test. The answer function runs against the in-memory store and a stubbed model. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `amplify/test/ask.test.ts`: the test "the answer streams, its sources follow the block that cites them, and done carries the blocks"

## Expected result

Every test whose title carries `BEH-ASK-ANSWER` passes. The answer streams, each source follows the block that cites it, and the final event carries the blocks. The failure path and the panel are not covered by this selector: they are tested in `amplify/test/ask.test.ts` and `site/test/chat.test.ts` under titles that do not carry it.
