---
markset: true
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-ATLAS-OUTLINE
  type: verification
  title: The outline renders the hierarchy with each state
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ATLAS-OUTLINE]
  verification:
    method: automated
    locator: packages/atlas/test/atlas.test.ts
    selector: BEH-ATLAS-OUTLINE
---

# The outline renders the hierarchy with each state

## Procedure

`pnpm test` runs `packages/atlas/test/atlas.test.ts` with node:test; the tests whose titles carry `BEH-ATLAS-OUTLINE` build the worked example's Atlas without evidence, with a current pass and with a stale one, and a generated model of 45 capabilities.

## Expected result

Every test whose title carries `BEH-ATLAS-OUTLINE` passes: the product, intent and outcome are headings in that order, the capability is one closed fold with its counts, the behavior's parts are listed and linked, nothing reads as verified without evidence, and the large model gives 45 closed folds.
