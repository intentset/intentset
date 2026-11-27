---
markset: 0
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-REVIEW-SURFACES
  type: verification
  title: Review lists surface changes on slices past draft, and not a draft's or a migration's
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-REVIEW-SURFACES]
  verification:
    method: automated
    locator: packages/cli/test/approve.test.ts
    selector: BEH-REVIEW-SURFACES
---

# Review lists surface changes on slices past draft, and not a draft's or a migration's

## Procedure

`pnpm test` runs these tests with node:test. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records.

- `packages/cli/test/approve.test.ts`: a draft slice declaring a surface is not listed; approving a slice changes no surface; an added key and a changed list on an approved slice are listed, in the text and in `surfaceChanges`; a base at 0.2, migrated, adds no line.

## Expected result

Every test passes, and every case gives its expected validity, diagnostics and output.
