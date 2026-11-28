---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-ARCH-NEXTJS
  type: verification
  title: The Next.js rule set keeps server-only code and outside packages out of the browser, routes and middleware
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-NEXTJS]
  verification:
    method: automated
    locator: packages/architecture/test/units.test.ts
    selector: BEH-ARCH-NEXTJS
---

# The Next.js rule set keeps server-only code and outside packages out of the browser, routes and middleware

## Procedure

`pnpm test` runs these tests with node:test: a directive is read only where a file opens with it; the shipped profile is the plain TypeScript one with the rule set, the router as composition and the default patterns; and a tree is checked whose silent files are named as not judged, then with client code reaching a listed package, reported once. The conformance cases of tests/vsa.json whose names start with NEXT cover each rule, its boundary and the code that reports in its place, and are not tagged here. The selector is the behavior's ID, which the title of the group the tests are in carries.

- `packages/architecture/test/units.test.ts`: the group "BEH-ARCH-NEXTJS: the Next.js profile and its rule set"

## Expected result

Every test whose title carries `BEH-ARCH-NEXTJS` passes.
