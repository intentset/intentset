---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-REVIEW-PINS
  type: verification
  title: A content-v1 review ignores lifecycle edits and catches every edit to the promise
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
  links:
    verifies: [BEH-REVIEW-PINS]
  verification:
    method: automated
    locator: packages/publisher/test/review-pins.test.ts
    selector: BEH-REVIEW-PINS
---

# A content-v1 review ignores lifecycle edits and catches every edit to the promise

## Procedure

`pnpm test` runs these tests with node:test. They compute content hashes of one record under lifecycle, review, key-order and quoting edits, which leave it unchanged, and under edits to its body, its other frontmatter and a deprecation or retirement, which move it; they show that `review`, like the extension it replaced, is outside the content hash and that the example's sources hash as they did before the move; they read each pin kind, absent as `content-v1` and `file-v1` as the whole file, bind `@current` by the record's kind, judge an unknown kind as needing review, and drop a review whose `hash` is not a string; they show that a `self` pin holds the knowledge's own text, which deprecating it does not move and editing it does, that an unbound `@current` self reads as changed, and that the gate hash moves with a source's audiences, visibility or availability and not with what it promises. The P04 cases of `tests/publication.json`, which `pnpm run conformance` runs, pin literal content hashes, with and without `hash`, and literal whole-file hashes under `file-v1` and with no `hash`, of the example's sources, and edit them after review, and pin `self`, literal and `@current`, under both kinds; the core cases on `review` hold its shape, `self` and `gates` as strings, and CORE001 for the retired extension. The selector is the behavior's ID, which each test's title carries.

## Expected result

Every test passes, and every P04 case gives its expected validity and diagnostics.
