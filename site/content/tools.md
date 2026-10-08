---
markset: 0
---

# The tools

{.lead}
One command does the work in a repository. The rest are what it is built from, and what other tools read the model through. Every package is at {{version}} on npm.

## The intentset command

`@intentset/cli` validates the model, checks the architecture, binds test results to a commit, reports what a change reaches, publishes reviewed knowledge and serves the Atlas. It is the one package a repository installs, and the one its agents run.

:::tabs
### npm
```sh
npm install --save-dev @intentset/cli
npx intentset init
```

### pnpm
```sh
pnpm add --save-dev @intentset/cli
pnpm exec intentset init
```
:::

[[Every command and option](cli/index.html)]{.button .primary} [[Start with one capability](../start/index.html)]{.button}

## The MCP server

`@intentset/mcp` is a read-only Model Context Protocol server on stdio, started with `intentset mcp`. The operator fixes its mode when it starts, and no client can change it. In engineering mode an agent can look up a record, load the context of a slice, see what a change reaches and search the graph; every result names the snapshot it came from. In customer mode it serves one publication and nothing else, so it holds no engineering record to leak.

## The Product Atlas

`@intentset/atlas` draws a model as static review pages: products and capabilities, each behavior with its rules, ownership, verification and publication readiness, and the diagnostics. `intentset serve` shows them while you work and `--out` writes them to a folder. The Atlas is internal: every page says it may hold restricted records and names the snapshot it describes.

## The publisher and the help runtime

`@intentset/publisher` is what `intentset publish` runs: the reviewed knowledge one audience may see for one release, as Markset documents that carry their sources, and a help file of tips for the product's own interface. It denies by default and never names what it left out.

`@intentset/help` reads that help file in the browser and binds each tip to the control that delivers the behavior it explains. It has no dependencies.

## The libraries

The command is built from libraries a tool of your own can use directly:

- `@intentset/core` reads records, validates them, traverses impact and writes the export. It has no dependencies, and its `readExport` is the consumer's check of an export another repository produced.
- `@intentset/markset-adapter` is the one place Markset is read: it turns a Markset document into what core validates, with Markset's own diagnostics kept apart.
- `@intentset/architecture` checks slices, claims, imports, layers and resources.
- `@intentset/verification` reads test reports into run records and decides whether each one still counts.

## The conformance suite

`@intentset/conformance-suite` is the cases every check is held to, the export envelopes a consumer must accept or reject, and the schemas, as data with no dependencies. It is for an implementation that is not this one. [What it holds](../conformance/index.html).
