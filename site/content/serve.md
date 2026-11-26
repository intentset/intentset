---
markset: true
---

# See your model in a browser

{.lead}
`intentset serve` starts a small web server on your machine that shows your records as linked pages, called the Atlas. You read the product the way a reviewer would, without opening a single file.

```sh
npx intentset serve
```

Then open http://127.0.0.1:3000/. The pages are built from the files in your repository and rebuilt when you edit one, so a change shows when you reload. Nothing leaves your machine.

[[Open the shop's model in the Atlas](../../example/atlas/)]{.button .primary}

That button opens, in a new tab, the Atlas of the shop the rest of this site tells, exactly as `intentset serve` would show it. Most of its records are approved, and its tests ran when this site was built. One pass no longer holds, because the sign-in code changed after its tests ran. One rule, that a reset link works only once, has no test, and the sign-in behavior is still a draft.

## What you will find

- **Product**: your product as a tree, from why it is changing down to each behavior, with its rules, its code, its tests and its help, and where each stands.
- **Needs attention**: what is waiting on a person. Records to approve, promises with no current pass, code no slice owns, and help held for review.
- **Map**: how everything connects, with each capability opened to show its records.
- **Records**: every record by type. A record's page shows its text as written and the records around it, and a behavior's page traces it from why it exists to the tests and help that hold it.
- **Ownership, Verification, Publication and Diagnostics**: the detail behind each of those, for whoever needs it.

## When it runs

`intentset serve` checks the records the way `intentset validate --level L2` does, and at L3 when it finds run records in `.intentset/evidence/`, so the Atlas can say which promises have a test that passes now. Without run records, it says so rather than show anything as passing.

`npx intentset serve --out <folder>` writes the same pages as files instead of serving them, for example to keep from a CI run. The pages say they are internal: they can show every record in the repository, so they are for your team, not for publication.

[[Every command and option](../cli/)]{.button} [[How it works](../../how-it-works/)]{.button}
