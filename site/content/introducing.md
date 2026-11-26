---
markset: 0
---

{.eyebrow}
A slide deck

# Introducing Intentset

{.lead}
What Intentset is, what it gives a team that builds with coding agents, and how to adopt it, in 10 slides, for anyone considering it. Each slide's speaker notes are folded beneath it.

{.deck-parts}
1. [The problem](#problem): a change can pass every check and still change the product.
2. [How it works](#idea): the promise written down beside the code, and a check on every change.
3. [What a team gets](#value): reviews in product language, agents with the right context, and help that stays true.
4. [Adopting it](#adopt): one feature first, then CI, then the rest of the product.

{.deck-hint}
On a wide screen, Present shows one slide at a time, filling the screen: the arrow keys, Space and Page Down move between them, N shows the speaker notes, and Esc comes back here. Printed, it is one slide to a page, without the notes.

Already have the idea? [Set up Intentset](../start/).

::::card{#cover .slide .cover}

{.wordmark}
Intentset

{.eyebrow}
For teams shipping with coding agents

## Keep control of what your agents build

{.lead}
Agents write code faster than anyone can review it. Intentset keeps what your product promises written down beside the code, and checks every change against it.

{.small}
intentset.org

::::

{.notes}
> [!NOTE]- Speaker notes
> Teams building with coding agents are shipping more than they ever have, and the gain is real. This deck is about what that speed costs once nobody can read every change, and how Intentset gives a team back control of what the product does, without slowing the agents down.

::::card{#problem .slide}

{.eyebrow}
The problem

## A change can pass every check and still change the product

{.lead}
An online shop's password reset links work for one hour. Customers report that their link has expired by the time they click it, and an agent is asked to fix it.

:::grid{cols=2}
- It raises the limit to 24 hours, so that links don't run out before people get to them, and updates the test that expected one hour.

- The complaints stop, the tests pass and CI is green. The summary says it fixes expired reset links, which is true. It is approved.

- {.spotlight}
  Nobody decided that reset links should last a day.

- A security decision was made as a bug fix, and the only trace of it is one number in the diff.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> Nothing here is a mistake anyone made. Every change makes small decisions about what the product does: what to refuse, what to allow, how long something lasts. When people wrote the code, those decisions passed through someone who knew the product. Now an agent makes them, and writes the tests that check them, in the same change. Green CI tells you the code does what the tests say. It cannot tell you whether anyone meant the product to change.

::::card{#trust .slide .turn}

## Without a record of what the product promises, every change asks for trust.

:::grid{cols=3 .ruled}
- While you still read every change

  You know what the product does, because you watched each part of it arrive.

- When the changes outgrow you

  Each pull request passes CI and looks reasonable. You skim the diff and approve.

- When someone asks

  What the product does when something fails is in the code, and nobody has read all of it.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> This is the risk in one sentence. If nobody wrote down what the product is supposed to do, nobody can tell whether a change kept it, and review turns into trusting the agent. The faster the changes come, the sooner a team moves from the first column to the third.

:::::card{#idea .slide}

{.eyebrow}
How it works

## Write the promise down, beside the code

::::columns{ratio="5:6"}

```markdown
# Reset links expire after one hour

## Constraint

A password reset link stops working
one hour after it is sent.
```

::col

:::grid{cols=1 .contrast}
- {.good}
  A short file in your repository

  Each promise is a few lines of Markdown under `product/`, reviewed in the same pull request as the code.

- An agent drafts it, a person approves it

  Often from code you already have. Only a person approves a promise.

- It names the code that keeps it

  So Intentset knows which promises a change to that code can affect.
:::

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> This is the shop's rule, as the file reads below its header. Each thing the product promises, including how it fails, is written down once like this. Your agents keep these files up to date in the same commit as the code; people approve them. Together, a product's records are its model: a set of files, not an AI model.

:::::card{#review .slide .dense}

{.eyebrow}
The check

## CI stops the change, and says why

{.lead}
The agent's fix changed the reset code while the records that describe it stayed the same, so `intentset review --fail-on-drift` fails with code 1:

```text
### SLICE-ACCOUNT-RESET: Password reset

- Not acknowledged: update the records below, or say in a commit that no behavior changed.
- Code changed: src/features/accounts/reset/policies/link-expiry.test.ts
- Code changed: src/features/accounts/reset/policies/link-expiry.ts
- Records describing it, none changed: ADR-RESET-LINK-LIFETIME, BEH-RESET-PASSWORD, RULE-RESET-LINK-EXPIRY, RULE-RESET-LINK-ONCE, SCN-RESET-EXPIRED, SLICE-ACCOUNT-RESET, TEST-RESET-LINK-EXPIRY
```

:::grid{cols=2}
- ### If the behavior changed

  The agent updates the rule in the same change, and the reviewer reads "one hour" become "24 hours" before any code.

- ### If it did not

  A commit says so, `Intentset-Unchanged: SLICE-ACCOUNT-RESET`, where a reviewer can question it.
:::

{.caveat}
Real output, trimmed

:::::

{.notes}
> [!NOTE]- Speaker notes
> This is the change from the start of the deck. An agent can edit a record as easily as a test, and Intentset lets it. The difference is where the edit shows up: a changed test is one line in a long diff, while a changed rule is one sentence in a file the reviewer reads first, in product language. Either way, a person decides before it merges.

::::card{#value .slide .key .dense}

{.eyebrow}
What a team gets

## Control of the product, at the speed agents work

:::grid{cols=3}
- ### Readable reviews

  A changed promise is one sentence, read before the code.

- ### Context for agents

  An agent loads what a file promises before it edits it.

- ### Tests tied to promises

  Each promise shows whether its test passes now. A stale pass shows as stale.

- ### Help that stays true

  A help article is held for review when a rule it explains changes.

- ### Decisions with a history

  Every change to a promise is a reviewed diff, with who approved it and when.

- {.spotlight}
  ### Nothing to host or buy

  Plain files you own, and an MIT-licensed command-line tool.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> This is what the records buy a team. Reviewers stop reading thousands of lines to find out what changed in the product: the records tell them first, in product language. Agents stop guessing, because `intentset context` hands them what the code they are about to change promises. The tests that matter are tied to the promises they hold, and a pass on code that has changed since counts for nothing. Customer help is held back when what it explains changes. None of it needs a service, a database or an account.

::::card{#loop .slide}

{.eyebrow}
How a team works with it

## Agents keep the records. People keep control

:::grid{cols=4 .flow}
- 01

  ### Draft

  An agent drafts the promise, from a plan or from code you already have.

- {.spotlight}
  02 · people only

  ### Approve

  A person reads the draft and approves it. Agents never approve.

- 03

  ### Build

  An agent changes the code and keeps its records in step, in the same commit.

- 04

  ### Check

  CI checks every pull request, and the reviewer reads the product change first.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> The division of labor is the point. Agents do the writing: `intentset init` writes the guide they follow, and one line in CLAUDE.md or AGENTS.md points them at it. People do the deciding: only a person approves a promise, and passing every automated check never counts as approval.

::::card{#fits .slide}

{.eyebrow}
Beside what you have

## It replaces nothing you already use

:::grid{cols=3}
- ### Your tests

  Stay as they are. A record says what each test is meant to hold, and Intentset reports whether it passes now.

- ### Your pull requests

  Stay as they are. The review adds what changed in the product, before the code.

- ### Your agents' instructions

  CLAUDE.md or AGENTS.md keep saying how to work in the repository. One line points them at the guide.
:::

{.band}
**What it is not.** It is not a test runner, it does not prove the product correct, and it never runs your code or edits your files when it checks them.

::::

{.notes}
> [!NOTE]- Speaker notes
> A team keeps its tools. Tests check the code; pull request summaries describe the diff; agent instructions say how to work. None of them says what the product promises today, and Intentset ties them to that. It is honest about its limits: a passing test can still assert the wrong thing, and people judge whether a check is adequate.

::::card{#adopt .slide}

{.eyebrow}
Adopting it

## One feature first, then the rest

:::grid{cols=3 .flow}
- Minutes

  ### Write down one feature

  An agent writes one feature down from your code and tests. You review about eight short files and see what it finds.

- Once

  ### Add it to CI

  Make the check required, so no change merges while its code and its records disagree.

- Over time

  ### Grow it

  Add features one at a time, as the value shows. Many agents can write down a whole product, with people approving.
:::

{.band}
**What each change costs.** The agent updates the records in the same commit, or adds one line saying nothing the product does changed.

::::

{.notes}
> [!NOTE]- Speaker notes
> Nobody models a whole product on day one. Start with one feature you already have: on a small TypeScript repository, setting it up and getting the first passing check takes about five minutes. Add the checks to CI next. Then grow it a feature at a time. Checks on how the code is organized, which keep each promise's code in one place, are available for TypeScript today.

:::::card{#try .slide .finale}

{.eyebrow}
Get started

## Set it up

{.lead}
Install the command in your repository, let it write its configuration, and have your agent write down one feature you already have.

::::columns{ratio="3:2"}

```sh
npm install --save-dev @intentset/cli
npx intentset init
npx intentset validate
```

::col

{.cta}
Every step: [intentset.org/start](../start/)

Toolchain on npm under @intentset. MIT licensed.

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> `init` writes the configuration, empty registries and the guide your agents follow. [Set up Intentset](../start/) walks through the rest: the names records may use, the prompt that has an agent write down one feature, connecting the tests, and then adding the checks to CI.
