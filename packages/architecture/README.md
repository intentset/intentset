# @intentset/architecture

The Traceable Vertical Slice Architecture checker (`spec/vsa-0.1.md`) with the TypeScript and AWS Amplify Gen 2
profile's boundaries: path claims and ownership, the import graph read with TypeScript 7's scanner, regions, layers,
areas, exceptions and a baseline of known violations. It reads files it is given and runs nothing.

## Install

```sh
npm install @intentset/architecture
pnpm add @intentset/architecture
```

## Example

Most repositories run it through the CLI, `@intentset/cli`, at L2:

```sh
npx -p @intentset/cli intentset architecture check
npx -p @intentset/cli intentset architecture check --mode strict   # no baseline: every violation fails
```

With pnpm, `pnpm dlx --package=@intentset/cli intentset …`, or `pnpm exec intentset …` once `@intentset/cli` is
installed. The command is always `@intentset/cli`'s: this package has no `intentset` binary, and npx asked
for `intentset` alone would fetch an unrelated unscoped package from the registry.

From code, after core's validation:

```ts
import { checkArchitecture } from "@intentset/architecture";

// result from validate(), registries from readRegistries(), files: a Map of repository-relative path -> text
const check = checkArchitecture(result.graph, registries, { files });
for (const d of check.diagnostics) console.log(d.path, d.code, d.message);
```

It needs TypeScript 7 as a peer. On an earlier TypeScript, run the CLI without installing it:
`npx -p @intentset/cli -p typescript@7 intentset architecture check`.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
