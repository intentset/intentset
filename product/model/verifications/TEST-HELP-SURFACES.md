---
markset: 0
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-HELP-SURFACES
  type: verification
  title: Leads are read in order, under review left out by default, and a bad surfaces map refuses the file
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-HELP-SURFACES]
  verification:
    method: automated
    locator: packages/help/test/help.test.ts
    selector: BEH-HELP-SURFACES
---

# Leads are read in order, under review left out by default, and a bad surfaces map refuses the file

## Procedure

`pnpm test` runs these tests with node:test. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records.

- `packages/help/test/help.test.ts`: the publisher's file carries `{}`; `leadFor` and `surfaceHelp` under both modes, a surface whose leads are all under review and one the file does not list, prototype names included; `helpForPage` with and without a surface, the lead first and each article once, `pendingReview` holding control IDs only; `readHelp` refusing a missing or non-object `surfaces`, a digits-only, `__proto__` or markup key, an extra member, an empty or repeating list and an unlisted article.
- `test/help-file.test.ts`: the package's surface ID patterns are core's.
- `test/consumer/consumer.mjs`, run by `pnpm run smoke:packed`: the packed package's `leadFor` and `helpForPage` read the example's file.

## Expected result

Every test passes, and every case gives its expected validity, diagnostics and output.
