---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ASK-CONTACT
  type: verification
  title: A contact request is answered with the get-involved page
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ASK-CONTACT]
  verification:
    method: automated
    locator: amplify/test/ask.test.ts
    selector: BEH-ASK-CONTACT
---

# A contact request is answered with the get-involved page

## Procedure

`pnpm test` runs these tests with node:test. The answer function runs against the in-memory store and a stubbed model whose answer links the get-involved page. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `amplify/test/ask.test.ts`: the test "an answer that sends the visitor to the get-involved page is marked as a contact request"

## Expected result

Every test whose title carries `BEH-ASK-CONTACT` passes. The stored question is marked as a contact request.
