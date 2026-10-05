# @intentset/core

The heart of Intentset, with no dependencies: the strict frontmatter carrier, the typed product graph and its
validator, impact traversal, the export envelope, and `readExport`, the checks a tool that imports an export must
make before it trusts one (`spec/export.md` §5).

## Install

```sh
npm install @intentset/core
pnpm add @intentset/core
```

## Example

Read an export another repository's CI wrote, as Streamlane and Driftline do:

```ts
import { readFile } from "node:fs/promises";
import { readExport } from "@intentset/core";

const read = readExport(await readFile("intentset-export.json"), { repository: "you/repo" });
if (read.ok) {
  console.log(read.envelope.contract, read.envelope.artifacts.length, "artifacts", read.supplied);
} else {
  console.error(read.category, read.problems); // malformed, unsupported-contract, ...: nothing is imported
}
```

`validate`, `impact`, `exportGraph` and the rest are what `@intentset/cli` is built from. Valid and deliberately
invalid envelopes to test a consumer against ship in `@intentset/conformance-suite`.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
