# @intentset/markset-adapter

The one place Intentset imports [Markset](https://markset.org/): it reads a record as a Markset document and hands
core the same input `plainCarrier` does, with Markset's own diagnostics kept apart under origin `syntax`. It pins
`@markset-lang/parser` to one exact version, `MARKSET_VERSION`, so two packages never read a document with two parsers.

## Install

```sh
npm install @intentset/markset-adapter
pnpm add @intentset/markset-adapter
```

## Example

```ts
import { readFile } from "node:fs/promises";
import { readRegistries, validate } from "@intentset/core";
import { marksetCarrier } from "@intentset/markset-adapter";

const path = "product/scheduling/BEH-ASMT-SCHEDULE.md";
const input = marksetCarrier(path, await readFile(path, "utf8"));
const { registries } = readRegistries(await readFile(".intentset/registries.yaml", "utf8"), ".intentset/registries.yaml");
const result = validate([input], registries);
for (const d of result.diagnostics) console.log(d.path, d.code, d.origin, d.message);
```

A diagnostic with origin `syntax` is Markset's and keeps Markset's code, such as `DIRECTIVE_UNKNOWN_NAME`; Markset's
guide for writing its syntax is https://markset.org/guide.md.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
