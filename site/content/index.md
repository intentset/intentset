---
markset: 0
---

::::::columns{.hero ratio="5:4"}
{.eyebrow}
Product truth for agentic development · v0.1 draft

# Keep control of what your agents build

{.lead}
Agents write code faster than anyone can read it. Intentset keeps what your product promises, which code delivers each promise and how it is checked, in readable records your agents update with every change.

People review the product rather than the diff, and steer it where it needs to go.

[[See how it works](how-it-works/index.html)]{.button .primary} [[Read the draft specification](specifications/index.html)]{.button}

> [!NOTE]
> The specifications are ready for review. The reference toolchain, version {{version}}, is published to try them against.

::col

:::::card{.model}
{.eyebrow}
One change · what the reviewer reads

:::steps
1. [Code]{.badge} 2,140 lines changed in 31 files
2. [Behavior]{.badge .info} Schedule a student assessment: its failure outcome rewritten
3. [Rule]{.badge} Future release time: tightened
4. [Checks]{.badge} Two updated; one passes on this commit, one has not run
5. [Knowledge]{.badge} The teachers' guide is held for review
6. [Drift]{.badge} None: every slice whose code changed updated its records
:::

{.small .muted}
Illustrative · not a live report
:::::
::::::

***

{.eyebrow}
The problem

## Agents write faster than anyone can read.

{.lead}
A team used to understand its product because it wrote the code. Now agents write most of it, in changes too long to read line by line.

Without a record of what the product promises, every change asks for trust. Behavior shifts without anyone deciding it should. Debt gathers where nobody looks. What the product does is known only to the code, and to whichever agent read it last.

Intentset gives that knowledge a durable place in the repository, centered on observable product behavior, and keeps it true as the code changes.

***

{.eyebrow}
How it fits

## Your agents keep the model. You keep control.

:::steps{.adopt}
1. **Agree the promise.** A product manager and an agent draft the behaviors and rules for what comes next, as draft records in the repository.
2. **Approve it.** A person reads the drafts and approves them. Agents never approve.
3. **Build it.** An agent loads what the code it is changing promises, works inside the slice that owns it, and updates the records and checks in the same commit.
4. **Check it.** CI validates the model, holds the boundaries between slices, binds test results to the commit, and fails when code changed and its records did not.
5. **Review the product.** The reviewer reads what changed in behavior, ownership and evidence, and everything the change could reach.
6. **Explain it.** Customer explanations whose sources changed are held for review before they are published again.
:::

{.muted}
Records are short, written in product language, and diff cleanly: a few dozen lines a person can review, where the code runs to thousands.

***

{.eyebrow}
What you can ask

## Questions only a connected model can answer.

::::grid{cols=2}
- :::card[For product managers]
  - What does the product promise today, and what changed this week?
  - Does this new requirement contradict a rule we already keep?
  - Which promises have no check passing on this release?
  :::
- :::card[For engineers]
  - Which slice owns this file, and what does it promise?
  - What could this change reach: behaviors, owners, checks, explanations?
  - Are the boundaries holding, and is the debt going down?
  :::
- :::card[For customer knowledge]
  - What may we tell this audience about this release?
  - Which explanations went out of date when that rule changed?
  - Where did this answer come from, and who reviewed it?
  :::
- :::card[For agents]
  - What must I read before I edit this file?
  - Which records does my change have to update?
  - What am I not allowed to decide?
  :::
::::

***

{.eyebrow}
Architecture

## Keep the architecture yours.

Agents follow the shape of the code they are shown. Intentset gives every behavior one owning slice and checks the boundaries between slices on every change: another slice's private files, dependencies nobody declared, layers out of order, product rules hiding in shared code. Today's violations become a baseline that may shrink and may not grow, so debt is a number you can watch fall. An agent handed one slice's context makes a change that stays in that slice.

***

{.eyebrow}
A worked model

{#example}
## One behavior. A connected view.

:::::card[Example: Schedule a student assessment]{.example}
::::columns{ratio="2:3"}
A teacher chooses when a published student assessment becomes available to a class.

[[Read the worked example](example/index.html)]{.button}

::col

- **Intent:** Help teachers prepare learning in advance.
- **Behavior:** Schedule a student assessment for a future time.
- **Rule:** The student assessment must be published and the teacher must be allowed to assign it.
- **Implementation:** One accountable slice, with explicit contracts and backend ownership.
- **Verification:** Named checks, with evidence tied to a particular snapshot.
- **Knowledge:** Reviewed guidance for the right audience and release.
::::

> [!NOTE]
> Illustrative model. These links describe the proposed structure, not a live verification report.
:::::

***

{.eyebrow}
In practice

## Two products adopting it, in the open.

{.lead}
Coral Reef Ventures is adopting Intentset in two of its own products, and recording what it catches, what it costs and what it changes.

In Streamlane, a work management product, the model is a required check on every pull request. The first capability modelled, from the code, tests and decision records the repository already held, listed what nobody had: two of three rules had no test, and three behaviors were checked only in the browser. The check now runs against 37 slices and 86 records, over a baseline of the violations that were already there, which may shrink and may not grow.

Driftline was modelled before any of its code existed, and its first package was checked against what had been approved. It now reads Streamlane back: Streamlane's backend names the behaviors each call delivers, and Driftline counts what each behavior saw.

[Read the adoption log](pilot/index.html), and what it changed in the specifications.

***

:::card{.status}
{.eyebrow}
Project status

## Specifications in review. A toolchain to try them with.

The v0.1 specifications define the product model, traceable vertical slices, a TypeScript + AWS Amplify Gen 2 reference profile and reviewed publication. An export contract fixes what other tools read from a model.

The reference toolchain is at {{version}} on npm: validation, architecture checks, evidence, change impact, a Product Atlas, reviewed publication with tips for the product's own interface, agent context and the export, with a guide and a drift check for the agents that keep the model. They are early releases, to try against one real capability.

[Read the specifications](specifications/index.html) · [View the roadmap](roadmap/index.html)
:::

***

:::card{.closing}
## Try it on one capability.

{.lead}
Let an agent model one capability from your code and tests, review what it wrote, and see what it finds.

[[Start with one capability](start/index.html)]{.button .primary} [[Read the draft specification](specifications/index.html)]{.button}
:::
