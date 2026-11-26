---
markset: 0
---

{.eyebrow}
A slide deck

# Introducing Intentset

{.lead}
What Intentset is, why it exists and how it works, in 14 slides, for anyone deciding whether it is worth a closer look. Parts one to three make the case in plain words and need no setup; part four is for whoever will set it up; part five is how to adopt it and try it. Each slide's speaker notes are folded beneath it.

{.deck-parts}
1. [Why Intentset exists](#cover): agents write code faster than anyone can read it.
2. [The idea in plain words](#idea): the product's promises, written down and kept true.
3. [How a team works with it](#loop): who writes, who decides, and what a reviewer reads.
4. [Under the hood](#under): records, ownership in the code, and evidence.
5. [Adopting it](#levels), one capability and one level at a time.

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
What Intentset is, why it exists, and how it works: in plain words first, then under the hood.

{.small}
intentset.org

::::

{.notes}
> [!NOTE]- Speaker notes
> Intentset is a way of writing down what a product promises, and keeping that record true while coding agents change the code. The first half of this deck needs no technical background. The second half shows the files, the checks and the tools.

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

::::card{#idea .slide}

{.eyebrow}
The idea

## Write the promises down, and keep them true

{.lead}
Five questions about each thing the product does, answered in short files beside the code. The answers here are for the shop's password reset.

:::grid{cols=4 .promise}
- ### Why

  Why build it, and did it work?

  Locked-out customers get back in without contacting support.

- ### What

  What does it do, and refuse?

  Reset a password from an emailed link; refuse a link older than an hour.

- ### Where

  Which code keeps the promise?

  The password reset code, and nothing else.

- ### Proof

  Is it tested, and passing now?

  A test tries the link just before and just after the hour.

- ### Words

  What is each audience told?

  The help article on resetting a password.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> This is the whole idea on one slide. Take one thing the product does and write down five things about it: why it exists and how you would know it worked; what it does, including what it refuses; which part of the code is accountable for it; the tests that check it, and whether they pass right now; and what each audience is told about it. They live in the repository as short, linked files, so they change in the same commit as the code, and when the code changes and the promise does not, that shows up at review. Agents do the writing. People decide what the promises are.

:::::card{#behavior .slide}

{.eyebrow}
The heart of it

## A behavior is one promise

::::columns

{.lead}
One recognizable thing the product does, **including how it fails.**

:::grid{cols=1 .contrast}
- {.good}
  A behavior: one thing the product does

  "Reset a forgotten password from an emailed link"

  Small enough to test, and it can pass or fail.

- Not a behavior: a topic

  "Accounts"

  It names an area of the product, not something it does.
:::

::col

:::card{.panel}
{.label}
A behavior

### Reset a forgotten password

**What happens.** A customer who has forgotten their password asks for a reset link, and sets a new password from the link in the email.

**When it works.** The new password replaces the old one and the link stops working.

**When it fails.** An expired or already used link is refused, and the password is unchanged.
:::

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> Everything in Intentset is organized around behaviors. "Accounts" is a heading in a roadmap, not a promise: there is nothing in it to test. "Reset a forgotten password from an emailed link" is one. A behavior is small enough to recognize and to test, and it always says what happens when things go wrong, not only when they go right. Something that must stay true across behaviors, such as how long a reset link lasts, is a rule, written once.

::::card{#loop .slide .dense}

{.eyebrow}
How it fits

## Agents keep the records. You keep control

:::grid{cols=3 .loop}
- 01

  ### Agree the promise

  Product and an agent draft what comes next, as draft records.

- {.spotlight}
  02 · people only

  ### Approve it

  A person reads the drafts and approves them. Agents never approve.

- 03

  ### Build it

  An agent changes the code and its records in the same commit.

- 04

  ### Check it

  Automated checks test the model, the boundaries and the test results.

- 05

  ### Review the product

  Before the pull request merges, its reviewer reads which promises it changed, then the code.

- 06

  ### Explain it

  Explanations whose sources changed are held for review before they are published again.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> The division of labor is the point. Agents do the writing: they draft records, change the code and keep the records in step. `intentset init` writes the guide they follow, and one line in CLAUDE.md or AGENTS.md points them at it; it tells them never to approve, publish, or invent an owner, audience or release. People do the deciding: only a person moves a record from draft to approved, and passing every automated check never counts as approval. Step five is the next slide.

:::::card{#review .slide .dense}

{.eyebrow}
Step 05 · the product review

## The check stops the change, and says why

{.lead}
The agent's fix changed the reset code while the records that describe it stayed the same, so `intentset review --fail-on-drift` fails with code 1:

```text
### SLICE-ACCOUNT-RESET: Password reset

- Not acknowledged: update the records below, or say in a commit that no behavior changed.
- Code changed: src/features/accounts/reset/policies/link-expiry.test.ts
- Code changed: src/features/accounts/reset/policies/link-expiry.ts
- Records describing it, none changed: BEH-RESET-PASSWORD, RULE-RESET-LINK-EXPIRY, SLICE-ACCOUNT-RESET
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

::::card{#honest .slide .key}

{.eyebrow}
Honest numbers

## Having a test is not passing it

{.lead}
A promise can have a test and still have no current pass: the test may not have run since the code changed, or may have been changed with it. Intentset reports two numbers, side by side.

:::grid{cols=2}
- Linked · 12 of 12 promises

  ### Has a test

  A test is attached to the promise. Nothing yet says it ran, or that it passed.

- {.spotlight}
  Current pass · 7 of 12 promises

  ### Passes now

  Its test passed, on code that has not changed since.
:::

The other five are shown as what they are: stale, skipped, failed, errored or never run. **None of them counts as a pass.**

{.caveat}
Illustrative · not a measured product

::::

{.notes}
> [!NOTE]- Speaker notes
> In this example every one of twelve promises has a test, so counting the tests attached would call all twelve covered. Only seven have a test that passed on the code as it stands now. The other five might be fine, but nobody can say so: a test that passed last month, on code that has changed since, proves nothing about today. Intentset keeps the two numbers apart and shows both.

::::card{#under .slide .part}

{.eyebrow}
Part four

## Under the hood

{.lead}
The files, who owns what in the code, and how evidence counts.

For the people who set it up. If you came for the idea, you have seen it: skip to [Adopting it](#levels) or [Try it](#try).

::::

{.notes}
> [!NOTE]- Speaker notes
> From here on the deck is for the people who will set Intentset up and live with it day to day: engineers, technical product managers and anyone configuring agents.

:::::card{#record .slide .dense}

{.eyebrow}
Records

## Open files, explicit meaning

::::columns{ratio="5:6"}

```markdown
---
markset: 0
intentset:
  id: RULE-RESET-LINK-EXPIRY
  type: rule
  title: Reset links expire after one hour
  status: draft
  owner: team-accounts
---

# Reset links expire after one hour

## Constraint

A password reset link stops working
one hour after it is sent.
```

::col

:::grid{cols=2}
- ### One file per record

  Markdown with YAML frontmatter, reviewed with the code.

- ### Frontmatter is for tools

  A stable ID, type, status, owner, audiences and links.

- ### The body is for people

  Each type has required sections. A behavior says who acts, the trigger, success and failure.

- ### The files are the truth

  Graphs, reports and pages are views rebuilt from them.
:::

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> This is the shop's rule as a file, abridged. The part between the dashes is what the tools read. The part below is what people read. Because it is just a file in the repository, it is reviewed in the same pull request as the code, reads on GitHub with nothing installed, and needs no database or hosted service. There are thirteen record types, but behaviors and rules carry most of the weight day to day. A link is written once, on the record that points, and the tools work out the reverse.

:::::card{#slices .slide .dense}

{.eyebrow}
Ownership · optional, and worth it

## Each behavior has one owner in the code

::::columns

A **slice** is the part of the codebase accountable for a set of behaviors, end to end: interface, logic, backend access, tests and documentation.

It declares the files it owns and its public entrypoints. Other slices collaborate through declared contracts, not by reaching into its files.

::col

:::card{.panel}
{.label}
`intentset architecture check` reports

- an import of another slice's private file
- a dependency nobody declared, or a cycle
- a layer importing one it may not
- business logic importing an interface framework
- two slices claiming the same file
- product behavior hiding in shared code
:::

::::

{.band}
**Adopt by scope.** Today's violations become a baseline that may shrink and may not grow, so debt is a number you can watch fall.

:::::

{.notes}
> [!NOTE]- Speaker notes
> Agents follow the shape of the code they are shown. If every behavior has one owning slice, an agent handed that slice's context makes a change that stays inside it. A product can even be modelled before it is built: while a slice is a draft, missing files are warnings, and approving it makes them errors.

::::card{#evidence .slide .dense}

{.eyebrow}
Evidence

## Verified means passing now

:::grid{cols=4 .flow}
- In the repository

  ### Verification record

  How a claim is checked: a named test, or a review procedure.

- In CI

  ### A test run

  Vitest, Playwright or node test reports, imported as run records.

- Kept outside the commit

  ### Run record

  This check, on this code, passed, failed, skipped or errored.

- {.spotlight}
  The verdict

  ### Current pass

  Only while its binding holds. Otherwise it is stale.
:::

:::grid{cols=2}
- ### Subject binding, the default

  A pass counts while what it is about is unchanged: the behavior, the slices and files that deliver it, the test and what it imports.

- ### Commit binding, the strict one

  A repository or a release gate can ask for a pass on the commit under review.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> A verification record is a definition, not evidence: it says how to check, not that anyone did. Evidence is a run record produced by CI. Run records are never committed, because a record in the commit it assesses is stale the moment it lands. `intentset evidence stale` lists which checks need a run.

::::card{#levels .slide}

{.eyebrow}
Adoption

## Adopt in levels

| Level | What it adds | What you can then claim |
|---|---|---|
| **L1** Product model | Records parse, link and read correctly | The model is well formed |
| **L2** Traceable implementation | Ownership and architecture checks | Each behavior has one owner, and the code respects it |
| **L3** Verified product | Current passing evidence | Each promise has a current pass |
| **L4** Published knowledge | Reviewed help for each audience | What you publish is authorized and traceable |
| **L5** Continuous product truth | The L1 to L4 checks required in CI, impact reports and release snapshots | No change merges without passing them |

Each level includes the ones before it. A conformance claim always names its scope and the commit it was made at: one capability passing at L3 is not a repository at L3.

::::

{.notes}
> [!NOTE]- Speaker notes
> `intentset validate --level L3` runs every check up to that level. Most teams start at L1 on one capability, add ownership and evidence as they go, and widen the scope from there.

:::::card{#try .slide .finale}

{.eyebrow}
Get started

## Try it

{.lead}
In a scratch directory, not your repository: install the command, add the site's worked example, check it, and follow one behavior's links.

::::columns{ratio="3:2"}

```sh
mkdir intentset-demo && cd intentset-demo && npm init -y
npm install --save-dev @intentset/cli
npx intentset init --example
npx intentset validate
npx intentset impact BEH-ASMT-SCHEDULE
```

::col

{.cta}
Your own code: [intentset.org/start](../start/)

Toolchain on npm under @intentset. MIT licensed.

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> The example command writes the site's worked example, an invented school product, so you can run validate and impact before touching your own repository. Run it in a scratch directory: in your own repository, its records would land in your model. Then [Try it on your code](../start/) walks through modelling your first real capability.
