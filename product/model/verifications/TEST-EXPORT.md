---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-EXPORT
  type: verification
  title: Graph prints the export envelope
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-EXPORT]
  verification:
    method: automated
    locator: packages/cli/test/cli.test.ts
    selector: BEH-EXPORT
---

# Graph prints the export envelope

## Procedure

`pnpm test` runs these tests with node:test. The CLI runs `graph` on the worked example and on a failing repository, with `--out` and with `--report all` at L3; the core unit exports a graph holding a restricted artifact. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/checks.test.ts`: the test "graph --report all at L3 writes every report at the commit, and a consumer's reader accepts it"
- `packages/cli/test/checks.test.ts`: the test "graph refuses a report its level does not read, and a report it does not know"
- `packages/cli/test/cli.test.ts`: the test "graph prints an envelope that matches spec/export.schema.json"
- `packages/cli/test/cli.test.ts`: the test "graph on a failing repository still exports, marked fail, and exits 1"
- `packages/core/test/export.test.ts`: the test "a restricted artifact is withheld by default: absent, unlinked, counted, and still in the graph hash"

## Expected result

Every test whose title carries `BEH-EXPORT` passes. The envelope matches spec/export.schema.json; a failing repository still exports, marked fail, and exits 1; every report asked for is written at the commit and a consumer's reader accepts the result; a report the level does not read is refused; a restricted artifact is withheld and counted unless included.
