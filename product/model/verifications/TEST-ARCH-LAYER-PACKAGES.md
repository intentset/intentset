---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-ARCH-LAYER-PACKAGES
  type: verification
  title: A layer imports only the packages its policy allows, and only presentation renders
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-LAYER-PACKAGES]
  verification:
    method: automated
    locator: packages/architecture/test/units.test.ts
    selector: BEH-ARCH-LAYER-PACKAGES
---

# A layer imports only the packages its policy allows, and only presentation renders

## Procedure

`pnpm test` runs these tests with node:test. The configuration reader takes `forbiddenPackages` and refuses a malformed one with CFG001; a pattern matches a specifier and its subpaths and not a longer name; the extractor gives the line of a file's first JSX element; the check reports a UI framework in a policy, a model and the client seam of a slice with the reference layout's folders, lets a repository's own policy replace the default, leaves a backend SDK to AMP006, and reports JSX outside presentation while presentation and tests render freely. The conformance cases of tests/vsa.json whose names start with TS007 and TS008 cover the same rules on the worked example, and are not tagged here. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries.

- `packages/architecture/test/units.test.ts`: the tests "forbiddenPackages maps layers to package patterns and replaces the default whole", "a package pattern matches the specifier and its subpaths, not a longer name" and "the extractor gives the line of a file's first JSX element, and none in a .ts file"
- `packages/architecture/test/units.test.ts`: the group "what a layer may import from packages, and where JSX may be rendered"

## Expected result

Every test whose title carries `BEH-ARCH-LAYER-PACKAGES` passes.
