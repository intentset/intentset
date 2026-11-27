---
markset: 0
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
  id: TEST-PUBLISH-UNDER-REVIEW
  type: verification
  title: Keepable knowledge is published under review only when asked, marked and apart, and nothing else is
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-PUBLISH-UNDER-REVIEW]
  verification:
    method: automated
    locator: packages/publisher/test/under-review.test.ts
    selector: BEH-PUBLISH-UNDER-REVIEW
---

# Keepable knowledge is published under review only when asked, marked and apart, and nothing else is

## Procedure

`pnpm test` runs these tests with node:test. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records.

- `packages/publisher/test/under-review.test.ts`: keepable knowledge is published under review only when the request asks, at `under-review/`, with its block and note; each condition of keepable fails on its own, a retired source included; CORE008 names the condition that failed, and names an edit to the knowledge's own text even when every source pin is current; a kept document is never chunked; a request with the field publishes the same current documents byte for byte, and its index's request ends with it; the output is the same at two commits; a kept page is `noindex` and a kept fragment is wrapped; in a run for two roles a kept document links a current one with `../`, and a current one that links it is refused; a kept document's link to a current document gets `../` whatever backslash escape or character reference its destination holds, in the file name (`BEH\-…`, `BEH&#45;…`) or after it, and a destination naming another file is left as written.
- `packages/cli/test/approve.test.ts`: `publish --keep-under-review` writes the kept document under `under-review/`, never at the top level, writes no chunk, and names the held rule tip.
- `packages/mcp/test/mcp.test.ts`: customer mode serves a publication made with the field and never a kept document, and refuses one handed in as current.
- `test/help-file.test.ts`: every help file the publication cases write, those with kept documents included, passes `readHelp`.
- The P04 cases of `tests/publication.json` and their CORE008, PUB001, PUB002 and P01 neighbours, which `pnpm run conformance` runs, pin the block, the note, the page and fragment marks, the help file's marks and `withheldForReview`, the index, the link rewrite, the tie-break and every condition of keepable; the core cases hold `self` and `gates` as strings, a null `self` among the CORE001 cases.

## Expected result

Every test passes, and every case gives its expected validity, diagnostics and output.
