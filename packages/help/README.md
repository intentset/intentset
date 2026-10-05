# @intentset/help

Reads the `help.json` that `intentset publish` writes and puts each tip on the control of a product's interface that
delivers the behavior it explains. No dependencies; it runs in a browser and refuses a file with any problem, whole.

## Install

```sh
npm install @intentset/help
pnpm add @intentset/help
```

## Example

```ts
import { bindTips, readHelp } from "@intentset/help";

const read = readHelp(await (await fetch("/help/help.json")).text());
if (read.ok) {
  const { bound, missing } = bindTips(document, read.help); // every element with data-behavior="BEH-..." gets its tip
  console.log(`${bound.length} tips bound; no tip yet for`, missing);
}
```

The file was published for one audience, release, role, edition and set of flags, so a product serves each person
the one published for their entitlement.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
