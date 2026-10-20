---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-ATLAS-MAP
  type: verification
  title: The map draws the model and its script explores it
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  links:
    verifies: [BEH-ATLAS-MAP]
  verification:
    method: automated
    locator: packages/atlas/test/atlas.test.ts
    selector: BEH-ATLAS-MAP
---

# The map draws the model and its script explores it

## Procedure

`pnpm test` runs these tests with node:test. The Atlas units build the worked example's map directly; the site's browser test drives the worked example's map on intentset.org's build in Chromium at 390px and 1440px. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` turns the result into run records.

- `packages/atlas/test/atlas.test.ts`: the test "every record is a node and every authored link an edge, drawn once"
- `packages/atlas/test/atlas.test.ts`: the test "the same graph gives the same map, whatever order its files are read in"
- `packages/atlas/test/atlas.test.ts`: the test "the map comes first, after one sentence, and how to read and use it follows the picture"
- `packages/atlas/test/atlas.test.ts`: the test "no label overlaps another record's label or circle, and the box fits the drawing"
- `packages/atlas/test/atlas.test.ts`: the test "a verification's ring is green only for a current pass, and its status is in its title"
- `packages/atlas/test/atlas.test.ts`: the test "the script writes text, never markup, and asks for nothing"
- `site/test/browser.test.ts`: the test "the worked example's map finds, focuses, filters, goes full screen and follows, at phone and desktop widths"

## Expected result

Every test whose title carries `BEH-ATLAS-MAP` passes: each record is one node and each authored link one edge, the map's bytes do not depend on the order the files are read, the map stands right after the page's one opening sentence with the legend and the instructions below it, no ID overlaps another record's ID or circle in the example or in a crowded graph of a hundred records, the frame fits the drawing within a small margin, a verification's ring is green only for a current pass and its status is in its title, the script uses no markup sink, storage or request, and in a browser the map finds a record, marks its links, lists them, filters a family, clears on Escape, fills the screen and returns, and follows a selected record's link.
