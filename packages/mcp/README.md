# @intentset/mcp

A read-only Model Context Protocol server over an Intentset model. In engineering mode an agent asks for the slice,
behaviors, rules, contracts and checks behind the code it is about to change; in customer mode it reads one
publication's audience-safe knowledge and nothing else. It never writes.

## Install

```sh
npm install @intentset/mcp
pnpm add @intentset/mcp
```

## Example

Run it through the CLI, `@intentset/cli`, from the repository root, in your MCP client's configuration:

```json
{
  "mcpServers": {
    "intentset": {
      "command": "npx",
      "args": ["-y", "-p", "@intentset/cli", "intentset", "mcp", "--mode", "engineering"]
    }
  }
}
```

The `-p @intentset/cli` matters: this package has no `intentset` binary, and npx asked for `intentset` alone would
fetch an unrelated unscoped package from the registry. With `@intentset/cli` installed in the repository, `"command":
"pnpm", "args": ["exec", "intentset", "mcp", "--mode", "engineering"]` runs the installed copy.

From code, `createIntentsetServer(options)` builds the server and `runStdio(server)` serves it on stdio.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
