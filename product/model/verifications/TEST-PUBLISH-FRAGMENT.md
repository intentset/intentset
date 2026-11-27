---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/verification/0.4
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
- The same file, failing closed: a refused request publishes no document and so no fragment, the fragment of a customer projection names none of the internal behavior and rules it explains, by title or path, and a body that links to the internal behavior is refused whole.
- The same file: http, https, mailto and scheme-less URLs pass and every other scheme is refused, whatever its case and with tabs, line breaks or control characters before the colon; in a page and in a fragment, a `javascript:`, `vbscript:` or `data:` link, image, reference or definition keeps only its text, in a paragraph or a quotation, and a document with no such URL renders as before. A protocol-relative URL counts as having no scheme.
- The same file: a captioned `ascii` figure still renders, in page and fragment, as the renderer's own `data:image/svg+xml` image with the fence's text escaped, so the URL rule, which is for URLs taken from the source, is pinned not to reach it.
- `packages/cli/test/checks.test.ts`: `--html=fragment` writes `<ID>.fragment.html` and every other file as `--html` does; `--html=page` is `--html` byte for byte; `--html=body` and an empty value are refused and nothing is written.

## Expected result

Every test whose title carries `BEH-PUBLISH-FRAGMENT` passes. A fragment holds what the page holds, less its title heading, and nothing the page leaves out; neither carries a script-capable URL; a refused or excluded document has no fragment; a page is otherwise unchanged; an unknown rendering writes nothing.
