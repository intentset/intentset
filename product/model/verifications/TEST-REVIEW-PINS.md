---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-REVIEW-PINS
  type: verification
  title: A content-v1 review ignores lifecycle edits and catches every edit to the promise
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-REVIEW-PINS]
  verification:
    method: automated
    locator: packages/publisher/test/review-pins.test.ts
    selector: BEH-REVIEW-PINS
---

# A content-v1 review ignores lifecycle edits and catches every edit to the promise

## Procedure

`pnpm test` runs these tests with node:test. They compute content hashes of one record under lifecycle, review, key-order and quoting edits, which leave it unchanged, and under edits to its body, its other frontmatter and a deprecation or retirement, which move it; they read each pin kind, bind `@current` by the record's kind, and judge an unknown kind as needing review. The P04 cases of `tests/publication.json`, which `pnpm run conformance` runs, pin literal content hashes of the example's sources and edit them after review. The selector is the behavior's ID, which each test's title carries.

## Expected result

Every test passes, and every P04 case gives its expected validity and diagnostics.
