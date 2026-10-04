---
markset: 0
---

{.eyebrow}
In practice

# The first pilot: Streamlane's blocked state.

{.lead}
Streamlane is a work management product, in development. Its first Intentset model covers one capability. An agent wrote it from what the repository already held, and a person reviewed it.

## What was modelled

In Streamlane, a task or bug is blocked when another open item blocks it or someone gives a reason, and every screen, the start guard and the backend must agree on that answer. The capability spanned three packages, had tests at three levels, and had a decision record explaining its design. From those, the agent wrote:

:::metrics
| Records | Count |
|---|---|
| Behaviors | 5 |
| Rules | 3 |
| Scenarios | 2 |
| Tests bound | 8 |
| Records | 26 |
:::

Each of the eight verification records names a test that already existed. The agent also wrote the slice that owns the code and the contract it exposes, and the existing decision record joined the model by gaining frontmatter, its text unchanged. Every record started as a draft.

## What it found

The model validated, and its slice passed the architecture check. Reading it showed what no one had listed:

- **Two of the three rules had no test:** that the blocked state changes in the same transaction as its cause, and that a blocker hidden from the reader is counted but never named.
- **Three behaviors were checked only in the browser,** by end-to-end tests that need a deployed environment, so their evidence reads as missing until those run.
- **Five of the eight checks passed** on the commit the records describe: the core unit tests, and the backend tests against a local database.

None of this was new to the code. It was new to the people reading it.

## What it changed in Intentset

The pilot asked four questions the specifications had not answered, and each was decided:

1. **A slice can span packages.** The blocked state's logic lived in a shared package and its interface in the web app, so a slice now has one entrypoint per package it spans.
2. **Reaching past a slice's entrypoint is reported even from outside the checked scope,** as a warning, so a narrow scope no longer hides it.
3. **Test results stay outside the commit they assess,** because a commit cannot describe its own results.
4. **A draft rule with no test is a warning,** so the gap shows before it becomes an error.

It also exposed defects in the reference implementation, which were fixed before release.

## What came after

The model is on Streamlane's main branch. Tried against the 0.4 toolchain, a one-line change to the slice's code was listed for review with the 21 records that describe it, which is what the next change to the blocked state will meet.

[[Start with one capability](../start/index.html)]{.button .primary} [[See how it works](../how-it-works/index.html)]{.button}
