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

By default a bound control gets `data-help-tip` (the tip's text) and `data-help-knowledge` (the knowledge ID it came
from) and nothing a browser displays. A `title` shows only on mouse hover, never to keyboard or touch users, so the
product shows the tip, as a visible tooltip and an accessible description, through `render`:

```ts
bindTips(document, read.help, {
  render: (element, tip) => myTooltip.attach(element, tip.text), // your tooltip component, reachable by keyboard and touch
});
```

`bindTips` binds once. `watchTips` binds, then binds again whenever the DOM under its root changes, once per animation
frame, and unrenders every element it bound when disposed, so help mounted into another application's page binds only under
its own root and leaves that page as it found it. With the default render, `dispose` puts `data-help-tip` and
`data-help-knowledge` back as they were; with your own `render`, pass the `unrender` that undoes it:

```ts
import { watchTips } from "@intentset/help";

const watch = watchTips(container, read.help, {
  render: (element, tip) => myTooltip.attach(element, tip.text),
  unrender: (element) => myTooltip.detach(element), // with your own render and no unrender, nothing is undone
});
watch.coverage(); // { bound, missing } as of the last pass
watch.dispose(); // stop observing and unrender every element it bound
```

The file was published for one audience, release, role, edition and set of flags, so a product serves each person
the one published for their entitlement.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
