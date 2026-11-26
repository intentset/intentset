---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-PUBLISH-SURFACES
  type: verification
  title: A surface is written only from an eligible slice, with only published leads, and omissions name only admitted slices
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-PUBLISH-SURFACES]
  verification:
    method: automated
    locator: packages/publisher/test/surfaces.test.ts
    selector: BEH-PUBLISH-SURFACES
---

# A surface is written only from an eligible slice, with only published leads, and omissions name only admitted slices

## Procedure

`pnpm test` runs these tests with node:test. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records.

- `packages/publisher/test/surfaces.test.ts`: the help file's member order with `surfaces`; each omission reason (`draft`, `not-built`, `availability-missing`, `unavailable`, `nothing-published`, `reference` for an unadmitted ID and for a path of an unpublished record), a path that follows a route's `/` or holds no ID refused as whole path segments and the same characters inside a longer segment written, with the requested product's ID allowed in a key; a restricted slice with and without `authorizedRestricted`; no omission named for a slice the projection does not admit; a kept document leading a surface under `keepUnderReview` and not without; one role of a multi-role request admitting the slice; a surface declared twice, approved with approved and approved with draft; digit-led keys in code-unit order through `JSON.stringify`; no document, page or chunk carrying surfaces, and a change to surfaces moving only the help file and the snapshot.
- `packages/cli/test/checks.test.ts`: `publish` names the slices the projection admits whose surfaces it left out, writes nothing of them into a file, and writes an approved slice's surface into a customer file.
- `test/help-file.test.ts`: every help file the publication cases write, those with surfaces included, passes `readHelp`.
- The surface cases of `tests/publication.json`, which `pnpm run conformance` runs.

## Expected result

Every test passes, and every case gives its expected validity, diagnostics and output.
