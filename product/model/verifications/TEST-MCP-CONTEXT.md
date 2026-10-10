---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-MCP-CONTEXT
  type: verification
  title: The MCP server answers read-only
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-MCP-CONTEXT]
  verification:
    method: automated
    locator: packages/mcp/test/mcp.test.ts
    selector: BEH-MCP-CONTEXT
---

# The MCP server answers read-only

## Procedure

`pnpm test` runs these tests with node:test. The units call the server's tools in both modes in memory; the CLI tests start `intentset mcp` over stdio in both modes and with requests it must refuse. The selector is the behavior's ID, which each test's title, or the title of the group it is in, carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records for every selector a title carries.

- `packages/cli/test/serve.test.ts`: the test "mcp engineering serves the four context tools over the graph, and every result names the snapshot"
- `packages/cli/test/serve.test.ts`: the test "mcp customer serves only the two knowledge tools over one publication"
- `packages/cli/test/serve.test.ts`: the test "mcp customer refuses before any server starts: a refused request, a failing graph, the wrong mode's options"
- `packages/cli/test/serve.test.ts`: the test "the real bin speaks MCP on stdout and nothing else"
- `packages/mcp/test/mcp.test.ts`: the test "engineering mode lists the four read-only engineering tools, with JSON Schema inputs"
- `packages/mcp/test/mcp.test.ts`: the test "customer mode cannot reach an internal record by any tool or argument"

## Expected result

Every test whose title carries `BEH-MCP-CONTEXT` passes. Engineering mode lists the four read-only tools and every result names the snapshot; customer mode lists only the two knowledge tools over one publication and cannot reach an internal record by any tool or argument; a refused request, a failing graph or the wrong mode's options stop the command before a server starts; stdout carries MCP and nothing else.
