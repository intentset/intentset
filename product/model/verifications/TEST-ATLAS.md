---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ATLAS
  type: verification
  title: Serve renders the Atlas over the export
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-ATLAS]
  verification:
    method: automated
    locator: packages/cli/test/serve.test.ts
    selector: BEH-ATLAS
---

# Serve renders the Atlas over the export

## Procedure

`pnpm test` runs these tests with node:test. The CLI starts `serve` on a free port and fetches its pages, edits a record and fetches again, and runs `serve --out`; the Atlas units build the pages of the worked example directly. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/atlas/test/atlas.test.ts`: the test "the Atlas of the example has the five pages, a page per behavior, and the stylesheet once"
- `packages/atlas/test/atlas.test.ts`: the test "every page states the snapshot and the internal banner"
- `packages/cli/test/serve.test.ts`: the test "serve prints the URL, the snapshot and the warning, serves the Atlas, and refuses everything else"
- `packages/cli/test/serve.test.ts`: the test "serve rebuilds when a record changes, so a reload shows the edit, and writes nothing"
- `packages/cli/test/serve.test.ts`: the test "serve --out writes the Atlas and exits, the same bytes twice, never into scope or over files"

## Expected result

Every test whose title carries `BEH-ATLAS` passes. The server prints its URL and snapshot, serves the five pages and a page per behavior, each stating the snapshot and the internal banner, refuses every other request, shows an edit on the next request and writes nothing; `--out` writes the same bytes twice and never into the scope or over a file.
