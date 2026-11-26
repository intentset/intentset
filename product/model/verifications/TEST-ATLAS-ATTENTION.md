---
markset: true
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-ATLAS-ATTENTION
  type: verification
  title: Needs attention lists each group with its count
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ATLAS-ATTENTION]
  verification:
    method: automated
    locator: packages/atlas/test/atlas.test.ts
    selector: BEH-ATLAS-ATTENTION
---

# Needs attention lists each group with its count

## Procedure

`pnpm test` runs `packages/atlas/test/atlas.test.ts` with node:test; the tests whose titles carry `BEH-ATLAS-ATTENTION` build the worked example's Atlas without evidence, with a failing run, an unclaimed file and a rule changed since the knowledge's review, and a generated model of 45 capabilities.

## Expected result

Every test whose title carries `BEH-ATLAS-ATTENTION` passes: drafts by type, only unlinked claims without evidence, failing claims with a failing run, the unclaimed file, the held knowledge with why, and long groups folded closed.
