---
markset: 0
---

::::::columns{.hero ratio="5:4"}
{.eyebrow}
For teams shipping with coding agents · v0.2 draft

# Keep control of what your agents build

{.lead}
Agents write code faster than anyone can read it. Intentset keeps what your product promises, which code delivers each promise and how it is checked, in readable records your agents update with every change.

Intentset is an open specification and a command-line tool, MIT-licensed, with no service, no database and no account. Your agents keep short Markdown records beside the code that say what each part of the product promises, and a check in CI stops a change whose code moved while its records did not. A reviewer reads what changed in the product first, then the code, knowing what to look for.

[[See how it works](how-it-works/)]{.button .primary} [[Try it on your code](start/)]{.button}

Not sure you have this problem yet? [Start with the questions below](#problem), or [page through the introduction](introducing/), a slide deck in plain words.

> [!NOTE]
> The specifications are ready for review. The reference toolchain, version {{version}}, is published to try them against.

::col

:::::card{.model}
{.eyebrow}
One change · what the reviewer reads first

:::steps
1. [Code]{.badge} 2,140 lines changed in 31 files
2. [Behavior]{.badge .info} Schedule a student assessment: now accepts a release time up to an hour in the past
3. [Rule]{.badge} Require a future release time: loosened, and waiting for a person to approve it
4. [Checks]{.badge} The test on this rule changed with it, and has no current pass yet
5. [Help]{.badge} The teachers' guide still describes the old rule, so it is held for review
6. [Drift]{.badge} None: no code changed without its records
:::

{.small .muted}
Illustrative · Lantern, an invented product · not a live report
:::::
::::::

***

{.eyebrow}
The problem

{#problem}
## The speed is real, and so is what nobody decided

{.lead}
If agents write most of your code, you are probably shipping more than you ever have, and the gain is real. What it costs does not show up in any one change. It shows up later, as things the product does that nobody decided it should.

:::grid{cols=3}
- **While you still read every change**

  You know what the product does, because you watched each part of it arrive. Review works.

- **When the changes outgrow you**

  Each pull request passes CI and looks reasonable. You read the summary, skim the diff and approve. Nothing is wrong that you can point to.

- **When someone asks**

  A customer, a colleague or a fresh agent session asks what the product does when something fails. The only complete answer is in the code, and nobody has read all of it.
:::

### Questions to ask of your own repository

- Pick one thing your product does. Can you say what it does when that fails, without opening the code?
- The last time an agent fixed a failing test, did it change the code or the test? Did anyone decide which was right?
- Has one business rule, such as who may do what or when something is allowed, been written two ways by two agent sessions?

If every answer comes easily, you may not need Intentset yet. If one of them took a while, that is the problem this site is about.

### Why it gets harder as you go faster

None of this is a mistake anyone made. Every change makes small decisions about what the product does: what to refuse, what to allow, what happens when a step fails. When people wrote the code, those decisions passed through someone who knew the product. Now an agent makes them, and writes the tests that check them, in the same change. Green CI tells you the code does what the tests say. It cannot tell you whether anyone meant the product to change. Twice as many changes means twice as many of those decisions, and none of them is written down where a person decides.

:::::card[Illustrative: one change in Lantern, an invented school product]{.example}
An agent is asked to fix a bug: in one school, assessments open an hour late. Its fix runs to 2,140 lines in 31 files. One of those changes is in the code that refuses a release time in the past: it now allows a time up to an hour back, to absorb clocks that disagree. The test that expected the refusal is updated to expect acceptance, so it passes. CI is green. The pull request's summary says it fixes time zone handling for scheduled assessments, which is true. It is approved.

Nobody decided that teachers may now schedule an assessment in the past. The teachers' guide still tells them to choose a future release time. The product changed, and the only trace of it is one line in a long diff.

{.small .muted}
Illustrative · Lantern, an invented product · not a real event
:::::

The card at the top of this page is the same change as Intentset shows it to the reviewer before it merges: the rule that moved, in one line, and the guide held for review.

### It was already there, in a tested repository

On 2026-10-02 an agent wrote down one capability of the first of Coral Reef Ventures' own products to adopt Intentset, from the code, tests and decision record the repository already held. Two of the capability's three rules had no test, and three of the things it does were checked only in the browser. None of this was new to the code. It was new to the people reading it.

Once its records were a required check on every pull request, from 2026-10-06:

- The architecture check found 472 violations already in the code when it was switched on. It tolerated those and failed any new one. They reached 0 on 2026-10-11, and nothing has been tolerated since.
- From 2026-10-07 to 2026-10-10 the check ran 367 times. Nine times in four days, it stopped a change until someone said whether behavior had changed, and 355 of the 367 runs passed without anyone noticing it was there.

[Read the adoption log](pilot/) for how each was measured.

### What would have caught it

Not more review: no one reads 2,140 lines well. What helps is a short written statement of what the product promises, kept beside the code and changed only when someone means to, plus a check that stops a change whose code moved while that statement did not.

That is what Intentset keeps. Each promise is a **behavior**: one thing the product does, including how it fails. Something that must stay true across behaviors is a **rule**, written once. Both are short Markdown records. Your agents update them in the same commit as the code, and a person approves them. Intentset does not stop an agent from changing the product. It makes the change visible in product language, to the person who decides, before it merges.

***

{.eyebrow}
Where it sits

## One loop, and the part you can take alone

{.lead}
Intentset is the first part of a loop, the part that happens in your repository. It is MIT-licensed and needs no service and no purchase.

:::steps{.loop}
1. [Your repository]{.badge} **Intent written down** \
   Intentset (Open source · Early release)
2. **Carried to production on evidence** \
   Streamlane (Product · In development)
3. **Proven in use** \
   Driftline (Product · In planning)
:::

{.loop-return}
What use shows comes back as new intent.

None of the three needs the others.

***

{.eyebrow}
What it is

{#what-it-is}
## Files in your repository, and a command that checks them

{.lead}
Intentset is two things: an open specification for writing down what your product promises, and a command-line tool, `@intentset/cli` on npm, that checks your code, your tests and your published help against what is written. There is no service to sign up for, no account and no database.

`npx intentset init` writes three files under `.intentset/`. The records themselves are Markdown files under `product/`, one per promise, reviewed in the same pull request as the code. No Intentset command edits your code.

```text
your-repository/
  .intentset/
    config.yaml        which files are records: product/**/*.md
    registries.yaml    the names records may use: owners, audiences, releases
    agents.md          the guide your agents follow
  product/
    scheduling/
      BEH-ASMT-SCHEDULE.md
      RULE-ASMT-FUTURE.md
      ...
  src/                 your code, as it was
```

This is one whole record, a rule from Lantern, the invented school product the site uses as its example, exactly as `intentset init --example` writes it into `product/scheduling/`. Your agent writes the part between the `---` lines; you read the part below it. Linked together, a product's records are its model: a set of files, not an AI model.

```markdown
---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/rule/0.2
  id: RULE-ASMT-FUTURE
  type: rule
  title: Require a future release time
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
---

# Require a future release time

## Constraint

The authoritative server time must be earlier than the requested release time when the schedule is accepted.
```

### One check, and what a failure says

CI runs one command on every pull request:

```sh
npx intentset review --base origin/main --fail-on-drift
```

Here the code that decides whether a release time is accepted was changed to let one up to an hour in the past through, and the records were left alone. The check fails with exit code 1, and says why:

```text
## Code changed, records unchanged (1, 1 not acknowledged)

### SLICE-ASMT-SCHEDULE: Student assessment scheduling slice

- Not acknowledged: update the records below, or say in a commit that no behavior changed.
```

{.small .muted}
Real output, trimmed to the part that failed. It was made on 2026-11-25 by running this repository's `intentset` from source as `intentset review --base origin/main --fail-on-drift`, in a scratch git repository holding the worked example's records from `intentset init --example`, the one resource file the example's registry names, and one file of code their [slice]{.term tip="The part of the code accountable for a set of behaviors, end to end. Each behavior past draft has exactly one."} claims, committed on main and then changed on a branch. Lantern is invented; this is not a report from a real product.

Code that changed while its records did not is [drift]{.term tip="Code changed and its records did not."}. If the behavior changed, the agent updates the rule in the same pull request, and the reviewer reads one line:

```diff
-The authoritative server time must be earlier than the requested release time when the schedule is accepted.
+The requested release time must be no more than one hour earlier than the authoritative server time when the schedule is accepted.
```

If it did not, as in a refactor, a commit says so with `Intentset-Unchanged: SLICE-ASMT-SCHEDULE`. In the same scratch repository, either one made the same command pass.

The tool runs on Node 22.18 or later. The checks that read your source need TypeScript 7.

[See the whole worked example](example/) · [Try it on your code](start/) · [Every term, defined](glossary/)

***

{.eyebrow}
How it fits

## Your agents keep the records. You keep control

{.lead}
What changes in your day: you keep working the way you do. Your agent also updates a few short records under `product/` in the same commit as the code. CI fails if it changed code and left them alone, unless a commit says no behavior changed. You approve the promises; agents never do.

:::steps{.adopt}
1. **Agree the promise.** Whoever decides what the product does, a product manager or you, drafts the behaviors and rules for what comes next with an agent, as draft records in the repository. For code you already have, an agent writes the first records from it.
2. **Approve it.** A person reads the drafts and approves them. Agents never approve.
3. **Build it.** An agent loads what the code it is changing promises, works inside the slice that owns it, and updates the records and checks in the same commit.
4. **Check it.** CI checks the records, holds the boundaries in the code, records which tests passed on which code, and fails when code changed and its records did not.
5. **Review the product.** The reviewer reads the report `intentset review` prints first: the records that changed, everything the change could reach, and any code that changed without its records. Then the code.
6. **Explain it.** Customer explanations whose sources changed are held for review before they are published again.
:::

{.muted}
Records are short, written in product language, and diff cleanly: a few dozen lines a person can review, where the code runs to thousands.

***

{.eyebrow}
After the repository

## Where each record goes

- A behavior is the promise a person approves. In your repository, `intentset approve` writes that approval as a diff, so anything that reads the repository can tell an approved behavior from a draft.
- A rule is written once and governs many behaviors, so a refusal can name the rule it keeps.
- A check's run records say what passed and whether that pass still holds. Published from CI, they can be read outside the repository.
- Code that changes without its records is drift. CI fails on it.
- The usage-evidence format, one line per call naming the behaviors it exercised and never a person, is a draft and is not published here yet.

[What reads an Intentset model](tools/readers/), by two paths.

***

{.eyebrow}
Next to what you have

## Tests, summaries and notes each hold part of it

- **Tests.** An agent that changes a behavior can change its test in the same commit, and CI stays green.
- **A pull request summary** says what the agent meant to do, in its words, about one change.
- **CLAUDE.md or AGENTS.md** says how to work in the repository, not what the product promises.
- **Decision records** say why, once. An existing one joins the model by gaining frontmatter, its text unchanged.
- **Docs and help pages** fall out of date without anyone noticing. Help written as records is held for review when what it explains changes.
- **Tickets** describe a change and close. Records describe what the product does after it.

Intentset replaces none of them. It ties them to what the product promises, and fails CI when code changes and its records do not. [What it is not, and what you already have](how-it-works/#alongside) goes through each one.

***

{.eyebrow}
A worked model

{#example}
## One behavior, and five questions about it

:::::card[Example: Schedule a student assessment]{.example}
::::columns{ratio="2:3"}
In Lantern, an invented product, a teacher chooses when a published student assessment becomes available to a class.

[[Read the walkthrough](example/)]{.button} [[See Lantern on the map](example/atlas/map/)]{.button}

::col

- **Why build it, and did it work?** Help teachers prepare learning in advance.
- **What does it do, and refuse?** Schedule an assessment for a future time, never a past one.
- **Which code keeps the promise?** The scheduling code, and nothing else.
- **Is it tested, and passing now?** Its check is written down; in this invented example it has not been run.
- **What is each audience told?** The teachers' guide to scheduling, reviewed against what it explains.
::::

> [!NOTE]
> Illustrative model. These links describe the proposed structure, not a live verification report.
:::::

***

{.eyebrow}
In practice

## Two products adopting it, in the open

{.lead}
Coral Reef Ventures is adopting Intentset in the two products named in the loop above, and recording what it catches, what it costs and what it changes.

In the first, the records have been a required check on every pull request since 2026-10-06, and the findings under [The problem](#problem) come from it. The second was described in records before any of its code existed, and its first code was checked against them.

[Read the adoption log](pilot/): what it caught, what it cost and what it changed in the specifications.

Trying it is one capability, about five minutes on a fresh TypeScript repository with one feature and three tests; [what adopting it costs](how-it-works/#cost) covers the rest.

***

:::card{.status}
{.eyebrow}
Project status

## Specifications in review. A toolchain to try them with

The v0.2 specifications define the records, how code is owned and checked, a reference profile for TypeScript and AWS Amplify Gen 2, and how reviewed help is published. They are drafts, in review.

The reference toolchain is at {{version}} on npm. It checks the records, the boundaries in the code and the test results, on your machine and in CI. It is an early release: try it against one real capability.

[Read the specifications](specifications/) · [View the roadmap](roadmap/)
:::

***

:::card{.closing}
## Try it on one capability

{.lead}
Let an agent write one capability down from your code and tests, review what it wrote, and see what it finds.

[[Try it on your code](start/)]{.button .primary} [[Page through the introduction](introducing/)]{.button}
:::
