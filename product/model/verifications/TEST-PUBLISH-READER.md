---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/verification/0.3
  id: TEST-PUBLISH-READER
  type: verification
  title: A request for several audiences and roles is one run, and every file names the whole entitlement
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-PUBLISH-READER]
  verification:
    method: automated
    locator: packages/publisher/test/publish.test.ts
    selector: BEH-PUBLISH-READER
---

# A request for several audiences and roles is one run, and every file names the whole entitlement

## Procedure

`pnpm test` runs these tests with node:test; `pnpm run conformance` runs the publication cases ADR 0029 added to `tests/publication.json`. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/publisher/test/project.test.ts`: the test "checkRequest reads an audience or role list as a set, so order and repeats change nothing"
- `packages/publisher/test/project.test.ts`: the test "a list member that is not a name, an empty list, and a list for a single dimension are refused"
- `packages/publisher/test/project.test.ts`: the test "each unknown member of a list is refused on its own, and a known one never rescues it"
- `packages/publisher/test/project.test.ts`: the test "a role list admits knowledge available to any one of its roles"
- `packages/publisher/test/project.test.ts`: the test "availabilityReason fails closed on a missing block and names the first failing dimension"
- `packages/publisher/test/project.test.ts`: the test "CORE008 for an audience or role names only the request's values"
- `packages/publisher/test/publish.test.ts`: the test "availability records the request's values, every flag the request holds included"
- `packages/publisher/test/publish.test.ts`: the test "a role given as a string, a list of one or a list with a repeat publishes the same bytes"
- `packages/publisher/test/publish.test.ts`: the test "the index's request, with its authorization added back, publishes the same bytes"
- `packages/publisher/test/publish.test.ts`: the test "every document of a run names the same entitlement as its help file and index"
- `packages/publisher/test/publish.test.ts`: the test "a document refused for its Markset lends no title to another document's body"
- `packages/publisher/test/chunks.test.ts`: the test "every chunk carries its document's publication block: the same access filters and provenance"
- `packages/cli/test/checks.test.ts`: the test "a repeated --role publishes for the reader holding every one, and the summary names the set"
- `packages/cli/test/checks.test.ts`: the test "a --role value holding a comma is one unknown role, and the refusal says to repeat --role"
- `packages/cli/test/checks.test.ts`: the test "list reads a repeated --role as before, as a selector token for each"
- `packages/cli/test/serve.test.ts`: the test "mcp customer serves one publication for a reader who holds two roles"
- `packages/mcp/test/mcp.test.ts`: the test "customer results name the reader's audiences and roles as lists"
- `packages/mcp/test/mcp.test.ts`: the test "customer mode refuses an index of another profile or with a member the spec does not give"
- `packages/mcp/test/mcp.test.ts`: the test "customer mode refuses a document published for another reader than its index"

## Expected result

Every test whose title carries `BEH-PUBLISH-READER` passes. A list is read as a set and publishes the same bytes in any order or repetition; knowledge listing any requested audience or role is published in one run; every document, the help file and the index name the request's audiences, roles and flags as sorted lists; the index's request replays to the same bytes; an empty, malformed or unknown member, or a list in a single-valued dimension, refuses the request; CORE008 names only the request's values; a refused document lends no title; the CLI publishes for a repeated `--role` and says to repeat it when a value holds a comma; the MCP server refuses an index of another profile and a document of another entitlement.
