---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ASK-KEEP-QUESTION
  type: verification
  title: An answered question is kept scrubbed for the retention period
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ASK-KEEP-QUESTION]
  verification:
    method: automated
    locator: amplify/test/ask.test.ts
    selector: BEH-ASK-KEEP-QUESTION
---

# An answered question is kept scrubbed for the retention period

## Procedure

`pnpm test` runs these tests with node:test. The answer function runs against the in-memory store and a stubbed model, and the stored item is read back. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `amplify/test/ask.test.ts`: the test "the question and answer are kept scrubbed, with sources, tokens and corpus, for the retention period"

## Expected result

Every test whose title carries `BEH-ASK-KEEP-QUESTION` passes. The question and answer are stored scrubbed, with the sources, token counts and corpus version, and expire after the retention period. That the answer is still given when storing fails is tested under a title that does not carry this selector.
