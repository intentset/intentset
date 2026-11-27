---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-ARCH-OUTSIDE-PACKAGES
  type: verification
  title: A package that reaches outside is imported only from the seam, and never from a pure layer
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-OUTSIDE-PACKAGES]
  verification:
    method: automated
    locator: packages/architecture/test/units.test.ts
    selector: BEH-ARCH-OUTSIDE-PACKAGES
---

# A package that reaches outside is imported only from the seam, and never from a pure layer

## Procedure

`pnpm test` runs this test with node:test. Under the plain TypeScript profile with one package listed, an import from the presentation layer and a type-only import from a pure layer are each VSA015 and the seam's import is not; with no package listed, under that profile or the reference one, nothing is reported; and with no seam named only the pure layer's import is. The conformance cases of tests/vsa.json whose names start with VSA015 cover the same through the whole check and are not tagged here. The selector is the behavior's ID, which the test's title carries.

- `packages/architecture/test/units.test.ts`: the test "BEH-ARCH-OUTSIDE-PACKAGES: a package that reaches outside is the seam's to import, and never a pure layer's (VSA015)"

## Expected result

Every test whose title carries `BEH-ARCH-OUTSIDE-PACKAGES` passes.
