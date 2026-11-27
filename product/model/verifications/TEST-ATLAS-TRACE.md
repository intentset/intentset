---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-ATLAS-TRACE
  type: verification
  title: A behavior's page carries its trace
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ATLAS-TRACE]
  verification:
    method: automated
    locator: packages/atlas/test/atlas.test.ts
    selector: BEH-ATLAS-TRACE
---

# A behavior's page carries its trace

## Procedure

`pnpm test` runs `packages/atlas/test/atlas.test.ts` with node:test; the test whose title carries `BEH-ATLAS-TRACE` builds the worked example's Atlas, and again with the behavior's slice no longer implementing it.

## Expected result

The test passes: six steps in order before the context bundle, each record linked, and an unowned behavior's step saying no slice implements it.
