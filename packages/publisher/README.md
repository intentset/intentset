# @intentset/publisher

Publishes reviewed knowledge for one audience and release (`spec/publication.md`): it projects the graph deny by
default, checks that no excluded record's title or path leaks, and writes Markset documents with their provenance,
an index, retrieval chunks, and `help.json`, the tips a product shows beside its controls.

## Install

```sh
npm install @intentset/publisher
pnpm add @intentset/publisher
```

## Example

Most repositories publish through the CLI, `@intentset/cli`:

```sh
npx -p @intentset/cli intentset publish --visibility customer --audience teacher --product PRD-LANTERN \
  --release pilot-1 --role teacher --edition standard --out published/ --html
```

With pnpm, `pnpm dlx --package=@intentset/cli intentset …`, or `pnpm exec intentset …` once `@intentset/cli` is
installed. The command is always `@intentset/cli`'s: this package has no `intentset` binary, and npx asked
for `intentset` alone would fetch an unrelated unscoped package from the registry.

From code, `publish(graph, registries, request, { snapshot, publishedAt })` returns the documents, the index, the help
file and the diagnostics, and refuses the whole request when any field is missing or undeclared (PUB001).
`@intentset/help` reads the help file in the product.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
