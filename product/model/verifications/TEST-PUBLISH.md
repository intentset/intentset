---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-PUBLISH
  type: verification
  title: Publication projects reviewed knowledge and fails closed
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-PUBLISH]
  verification:
    method: automated
    locator: packages/cli/test/checks.test.ts
    selector: BEH-PUBLISH
---

# Publication projects reviewed knowledge and fails closed

## Procedure

`pnpm test` runs these tests with node:test. The CLI publishes from the all-draft worked example, from a copy with reviewed knowledge, from a graph that does not validate and with a request missing a dimension; the publisher units project hand-built graphs. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/checks.test.ts`: the test "publish from the all-draft example publishes nothing and says why"
- `packages/cli/test/checks.test.ts`: the test "publish writes reviewed knowledge with provenance, HTML, an index, a help file and chunks, naming no internal source"
- `packages/cli/test/checks.test.ts`: the test "publish refuses a graph that does not validate, and a request missing a dimension"
- `packages/publisher/test/project.test.ts`: the test "deny by default: type, lifecycle, visibility, audience and missing availability each exclude"
- `packages/publisher/test/references.test.ts`: the test "no reference diagnostic carries the referenced title or path"

## Expected result

Every test whose title carries `BEH-PUBLISH` passes. Nothing is published from drafts, and the command says why; reviewed knowledge is written with provenance, HTML, an index, a help file and chunks, naming no internal source; a failing graph or an incomplete request is refused; type, lifecycle, visibility, audience and missing availability each exclude; no diagnostic carries an excluded source's title or path.
