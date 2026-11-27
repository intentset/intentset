---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-ATLAS-NEIGHBORHOOD
  type: verification
  title: A record's page carries its neighborhood
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ATLAS-NEIGHBORHOOD]
  verification:
    method: automated
    locator: packages/atlas/test/atlas.test.ts
    selector: BEH-ATLAS-NEIGHBORHOOD
---

# A record's page carries its neighborhood

## Procedure

`pnpm test` runs `packages/atlas/test/atlas.test.ts` with node:test; the test whose title carries `BEH-ATLAS-NEIGHBORHOOD` builds the worked example's Atlas twice and a generated model whose capability links to thirty behaviors.

## Expected result

The test passes: the rule's page draws it picked out with the records one link away as links to their pages and its capability two links away, carries no script, gives the same bytes twice, and the crowded neighborhood stops at twenty-four records.
