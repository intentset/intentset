---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-ARCH-LAYER-NAMES
  type: verification
  title: A name is judged by the layer of the file that defines it
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ARCH-LAYER-NAMES]
  verification:
    method: automated
    locator: packages/architecture/test/units.test.ts
    selector: BEH-ARCH-LAYER-NAMES
---

# A name is judged by the layer of the file that defines it

## Procedure

`pnpm test` runs these tests with node:test. The extractor records the names each import and re-export takes and what each file exports itself; the name index follows a name through `export ... from`, an exported import binding and `export *` to the file that declares it, and calls a cycle or an unreadable export untraced; the check reports a client function taken through an entrypoint and lists a name it could not follow. The conformance cases of tests/vsa.json whose names start with VSA006 cover the bypass through the slice's own entrypoint, a barrel and another slice's entrypoint, and the boundary, and are not tagged here. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries.

- `packages/architecture/test/units.test.ts`: the test "each reference records the names it takes, and the file what it exports itself"
- `packages/architecture/test/units.test.ts`: the group "following a name to the file that defines it (VSA006)"
- `packages/architecture/test/units.test.ts`: the group "checkArchitecture judges a name by the file that defines it"

## Expected result

Every test whose title carries `BEH-ARCH-LAYER-NAMES` passes.
