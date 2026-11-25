---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-PUBLISH-FRAGMENT
  type: verification
  title: A fragment is the page's content without its title, sanitized as the page is
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-PUBLISH-FRAGMENT]
  verification:
    method: automated
    locator: packages/publisher/test/publish.test.ts
    selector: BEH-PUBLISH-FRAGMENT
---

# A fragment is the page's content without its title, sanitized as the page is

## Procedure

`pnpm test` runs these tests with node:test. The publisher units publish the worked example's reviewed knowledge with each rendering, and with bodies that hold raw HTML, a second level-one heading or none; the CLI test publishes the example into three directories. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests and turns the result into run records.

- `packages/publisher/test/publish.test.ts`: `"page"` and `true` give the same page and no fragment, `"fragment"` gives a fragment and no page, absent and `false` give neither, and the Markset document and its publication block do not change.
- The same file: the fragment equals the page's `<main>` content less its title heading, the same bytes on a second run, with no page element, stylesheet or provenance.
- The same file: `<script>`, `<iframe>` and an inline element with an event handler in the body reach neither the page nor the fragment.
- The same file, the boundary: only the first top-level level-one heading is left out, a later one keeps its heading and the page's id, and a body with none loses nothing; an unknown rendering throws.
- `packages/cli/test/checks.test.ts`: `--html=fragment` writes `<ID>.fragment.html` and every other file as `--html` does; `--html=page` is `--html` byte for byte; `--html=body` and an empty value are refused and nothing is written.

## Expected result

Every test whose title carries `BEH-PUBLISH-FRAGMENT` passes. A fragment holds what the page holds, less its title heading, and nothing the page leaves out; a page is unchanged; an unknown rendering writes nothing.
