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
  const { bound, missing, pendingReview } = bindTips(document, read.help); // every element with data-behavior="BEH-..." gets its tip
  console.log(`${bound.length} tips bound; no tip yet for`, missing, "; help under review for", pendingReview);
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
watch.coverage(); // { bound, missing, pendingReview } as of the last pass
watch.dispose(); // stop observing and unrender every element it bound
```

**Help under review.** A publication may keep knowledge under review (publication §3, ADR 0027): published from the
text its last review covered while what it explains has changed. Its entry in `knowledge`, and each tip it contributes,
carries `underReview: true`; a tip keyed to a rule is held back instead and its ID listed in `withheldForReview`,
because a rule's tip is the reason a product gives for a refusal. Every reader here leaves help under review out by
default (`underReviewHelp: "exclude"`), since your renderer may not show that it is under review; pass
`underReviewHelp: "include"` to `tipFor`, `helpForPage`, `articles`, `bindTips` or `watchTips` once it does, and show
the mark wherever you show the item. Either way the ID goes to `pendingReview`, never to `missing`, and a bound element
under review also gets `data-help-under-review`.

`tipFor` returns null for no tip, a held-back rule tip and, under `exclude`, a tip
under review alike, so it cannot measure coverage on its own. Count coverage from a `Binding` (`bound`, `missing`,
`pendingReview`), from `helpForPage`, or from `reviewStateFor(help, id)`, which answers `current`, `under-review`,
`held-back` or `none`; a coverage report counts `held-back` as written. `articles(help, options)` gives the file's
articles honouring `underReviewHelp`, with the IDs under review in `pendingReview`:

```ts
import { articles, reviewStateFor, tipFor } from "@intentset/help";

tipFor(read.help, "BEH-ASMT-SCHEDULE", { underReviewHelp: "include" }); // the tip, with tip.underReview when it is
reviewStateFor(read.help, "RULE-ASMT-AUTH"); // "held-back" while its knowledge is under review
const { knowledge, pendingReview } = articles(read.help); // current articles; under-review IDs in pendingReview
```

The file was published for one reader: every audience, role and flag it names, on one product, release and edition.
Those lists are held all-of, never read as "any of", so serve the file only where `servedTo` holds for the person:

```ts
import { type Reader, servedTo } from "@intentset/help";

const reader: Reader = {
  visibilities: ["public", "customer"],
  audiences: ["teacher"],
  roles: ["administrator", "teacher"],
  product: "PRD-LANTERN",
  release: "pilot-1",
  edition: "standard",
  flags: [],
};
if (read.ok && servedTo(read.help, reader)) bindTips(document, read.help);
```

The same test applies to a published document's `intentset-publication` block, which names the same entitlement. A
reader refuses a file holding any member publication §5 does not give it, so a newer file is refused rather than shown
in part.

## Learn more

Part of [Intentset](https://intentset.org/), which keeps product intent connected to the code that delivers it and the
checks that verify it, as readable Markdown files in a repository. The specifications are at
https://intentset.org/specifications/ and the source at https://github.com/intentset/intentset.

## Licence

MIT
