# @intentset/atlas

The Atlas: static review pages over a validated model, for the people who approve what agents write. Capabilities
and behaviors, ownership, verification status with missing and stale evidence shown as such, and publication
readiness, each count naming its snapshot and denominator. Every page is Markset rendered to HTML.

## Install

```sh
npm install @intentset/atlas
pnpm add @intentset/atlas
```

## Example

```sh
npx intentset serve                 # http://127.0.0.1:3000/, rebuilt when a file changes
npx intentset serve --out atlas/    # or write the pages, for CI to publish internally
```

From code, `buildAtlas(input)` returns a map of page path to HTML, where `input` holds the graph, the registries, the
diagnostics and the snapshot, and optionally classified evidence and an architecture check's result.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
