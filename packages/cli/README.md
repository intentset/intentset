# @intentset/cli

The `intentset` command: `init`, `validate` (levels L1 to L4), `graph` (the export), `impact`, `context`,
`architecture check`, `evidence import`, `review`, `publish`, `serve` (the Atlas), `mcp` and `guide`. Exit codes are 0
no errors, 1 validation errors, 2 invocation or tool failure.

## Install

```sh
npm install --save-dev @intentset/cli
pnpm add --save-dev @intentset/cli
```

## Example

```sh
npx intentset init --repository you/repo --example
npx intentset validate
npx intentset impact BEH-ASMT-SCHEDULE
npx intentset guide          # the agent guide for this repository, printed
```

With pnpm, `pnpm exec intentset` wherever `npx intentset` appears. `init` writes `.intentset/agents.md`, the guide
coding agents follow to keep the model current; point them at it from CLAUDE.md or AGENTS.md. The records are Markset
documents, and Markset's guide to its syntax is https://markset.org/guide.md.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
