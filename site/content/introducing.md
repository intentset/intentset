---
markset: 0
---

{.eyebrow}
A slide deck

# Introducing Intentset

{.lead}
What Intentset is, why it exists and how it works, in 24 slides: plain words first, then the files, the checks and the tools under the hood. Each slide's speaker notes are folded beneath it.

{.deck-parts}
1. [Why Intentset exists](#cover): agents write code faster than anyone can read it.
2. [The idea in plain words](#idea): the product's promises, written down and kept true.
3. [How a team works with it](#loop): who writes, who decides, and what a reviewer reads.
4. [Under the hood](#under): records, links, ownership, evidence and the tools that read them.
5. [Adopting it](#levels), one capability and one level at a time.

{.deck-hint}
On a wide screen, Present shows one slide at a time, filling the screen: the arrow keys, Space and Page Down move between them, N shows the speaker notes, and Esc comes back here. Printed, it is one slide to a page, without the notes.

::::card{#cover .slide .cover}

{.wordmark}
Intentset

{.eyebrow}
Product truth for agentic development

## Keep control of what your agents build

{.lead}
What Intentset is, why it exists, and how it works: in plain words first, then under the hood.

{.small}
intentset.org · specifications v0.2 draft

::::

{.notes}
> [!NOTE]- Speaker notes
> Intentset is a way of writing down what a product promises, and keeping that record true while coding agents change the code. The first half of this deck needs no technical background. The second half shows the files, the checks and the tools.

::::card{#problem .slide}

{.eyebrow}
The problem

## Agents write faster than anyone can read

{.lead}
A team used to understand its product because it wrote the code. Now agents write most of it, in pull requests too long to read line by line.

:::grid{cols=2 .stats}
- One pull request, as an agent hands it to a reviewer

  **6,800 lines**

  of code changed, across 74 files

- {.spotlight}
  The same pull request, as a person can read it

  **A few dozen**

  lines of records, in product language
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> Both boxes are one pull request, of a size agent-written changes reach every day, and many run larger. Nobody can review thousands of lines of generated code properly, every day. But the same change, described as what it does to the product, is short enough to read. That gap is what Intentset fills.

::::card{#trust .slide .turn}

## Without a record of what the product promises, every change asks for trust.

:::grid{cols=3 .ruled}
- In every change

  Behavior shifts without anyone deciding it should.

- Over months

  Debt gathers where nobody looks.

- When someone asks

  What the product does is known only to the code, and to whichever agent read it last.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> This is the risk in one sentence. If nobody wrote down what the product is supposed to do, nobody can tell whether a change kept it. Review turns into trusting the agent. Each change shifts a little behavior nobody chose; over months the shortcuts pile up out of sight; and when a customer or a colleague asks what the product does, the only answer is in the code.

::::card{#idea .slide}

{.eyebrow}
The idea

## Write down what the product promises, and keep it true

{.lead}
For each thing the product does, a few short files beside the code answer four questions. The examples are from Lantern, an invented school product.

:::grid{cols=4 .promise}
- ### The promise

  What the product does, including what it refuses.

  A teacher schedules an assessment for a future time, never a past one.

- ### The code

  The one part of the code accountable for keeping it.

  The scheduling code, and nothing else.

- ### The proof

  The tests that check it, and whether they pass on this code.

  Two tests, both passing on this commit.

- ### The words

  What customers and colleagues are told about it.

  The teachers' guide to scheduling.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> This is the whole idea on one slide. Take one thing the product does, here scheduling an assessment in Lantern, and write down four things about it: the promise itself, including what it refuses; which part of the code is accountable for it; the tests that check it, and whether they pass right now; and what customers are told about it. Those four stay connected, and they live in the repository, so they change in the same commit as the code. When the code changes and the promise does not, that shows up at review. Agents do the writing. People decide what the promises are.

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

  "Schedule a student assessment for a future time"

  Small enough to test, and it can pass or fail.

- Not a behavior: a topic

  "Student assessments"

  It names an area of the product, not something it does.
:::

::col

:::card{.panel}
{.label}
Lantern, an invented product

### Schedule a student assessment

**What happens.** A teacher picks a future time when a published assessment opens to a class.

**When it works.** The schedule is recorded.

**When it fails.** A time in the past, a class the teacher may not assign to, or an unpublished assessment is refused, and nothing is scheduled.
:::

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> Everything in Intentset is organized around behaviors. "Student assessments" is a heading in a roadmap, not a promise: there is nothing in it to test. "Schedule a student assessment for a future time" is one. A behavior is small enough to recognize and to test, and it always says what happens when things go wrong, not only when they go right. The example comes from Lantern, an invented education product used throughout the Intentset site.

::::card{#five .slide}

{.eyebrow}
One connected model

## Five questions, one model

:::grid{cols=4 .five}
- ### Why

  Why are we building this, and how will we know it worked?

  `intent, outcome, measure`

- ### What

  What can people do, and what must always stay true?

  `capability, behavior, rule, scenario`

- ### Where

  Which part of the code delivers it, and why was it built that way?

  `slice, contract, decision`

- ### Proof

  How is each promise checked, and does the check pass now?

  `verification`

- ### Words

  What may we tell each audience about it?

  `knowledge`
:::

A product reviewer starts at the top and drills down. An engineer starts from the code they are changing. Both arrive at the same behavior.

::::

{.notes}
> [!NOTE]- Speaker notes
> Each question is answered by its own kind of record, shown in small type under each card. Thirteen kinds in all, but you never need all of them on day one. The point is that they are linked, so you can walk from why a feature exists all the way to the test that proves it.

::::card{#lantern .slide .dense}

{.eyebrow}
A worked example

## One behavior, a connected view

:::grid{cols=3 .lantern}
- Intent · why

  Help teachers prepare learning in advance

- Rule · governs it

  Only a published assessment, only a class the teacher may assign

- {.spotlight}
  Behavior · the promise

  Schedule a student assessment for a future time

- Slice · delivers it

  One accountable part of the code, with declared contracts

- Verification · checks it

  Named checks, with evidence tied to the code they ran on

- Knowledge · explains it

  A reviewed guide for teachers, for the right release
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> Lantern is the invented product the Intentset site uses as its worked example. Here one behavior sits in the middle, and every other record points at it: the intent that explains why it exists, the rule it must keep, the part of the code that delivers it, the checks that prove it, and the guide that explains it to teachers. Ask about any one of them and you can reach all the others.

::::card{#loop .slide .dense}

{.eyebrow}
How it fits

## Agents keep the model. You keep control

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

  Before the pull request merges, its reviewer reads which promises it changed, not the diff.

- 06

  ### Explain it

  Explanations go to each audience: a customer knowledge base, tips in the product, a guide for support.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> The division of labor is the point. Agents do the writing: they draft records, change the code and keep the records in step. People do the deciding: only a person moves a record from draft to approved, and passing every automated check never counts as approval. Step five is the next slide: the pull request's reviewer reads it as a change to the product, not as a diff. Step six is where the same records reach people outside the team, as help articles for customers, tips beside the controls in the product, and guides for the people who support it.

:::::card{#review .slide .dense}

{.eyebrow}
Step 05 · the product review

## Review the product, not the diff

::::columns{ratio="1:2"}

{.lead}
One pull request, told as what it does to the product.

- **When:** before it merges, once its automated checks have run.
- **Who:** the pull request's reviewer, often whoever owns the product decision.
- **How:** from `intentset review`, beside the code review, which still checks the code.

::col

:::card{.panel .changes}
- [Code]{.badge} 6,800 lines changed in 74 files
- [Behavior]{.badge .info} **Schedule a student assessment** now also refuses a release time after the term ends
- [Rule]{.badge} **Release time** was "any future time"; now "a future time before the term ends"
- [Checks]{.badge} Two updated; one passes on this commit, one has not run
- [Knowledge]{.badge} The teachers' guide describes the old rule, so it is held for review
- [Drift]{.badge} None: every part of the code that changed updated its records
:::

::::

{.caveat}
Illustrative · not a live report

:::::

{.notes}
> [!NOTE]- Speaker notes
> The story of this change in one line: the rule about when an assessment may open was tightened so teachers cannot schedule past the end of term, and the scheduling behavior now refuses those times. That is what a reviewer reads instead of, or before, nearly seven thousand lines of code: which promise changed, which rule moved, which checks ran, which customer explanation now needs another look, and whether any code changed without its records. One honest gap is visible too: one of the two checks has not run yet.

::::card{#questions .slide}

{.eyebrow}
What you can ask

## Questions only a connected model answers

:::grid{cols=4 .asks}
- ### Product managers

  - What does the product promise today, and what changed this week?
  - Does this new requirement contradict a rule we already keep?
  - Which promises have no check passing on this release?

- ### Engineers

  - Which part of the code owns this file, and what does it promise?
  - What could this change reach?
  - Are the boundaries holding, and is the debt going down?

- ### Customer knowledge

  - What may we tell this audience about this release?
  - Which explanations went out of date when that rule changed?
  - Where did this answer come from, and who reviewed it?

- ### Agents

  - What must I read before I edit this file?
  - Which records does my change have to update?
  - What am I not allowed to decide?
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> Each of these questions needs the links between records to answer. A wiki page or a ticket cannot tell you which promises have no passing check on this release, or which customer explanations a rule change made stale. The last column matters as much as the others: agents also need to know where their authority ends.

::::card{#honest .slide .key}

{.eyebrow}
Honest numbers

## Having a test is not passing it

{.lead}
Many dashboards turn green as soon as a promise has a test attached. Intentset reports two numbers, side by side.

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

::::

{.notes}
> [!NOTE]- Speaker notes
> In this example every one of twelve promises has a test, so a dashboard that counts links would show all twelve green. Only seven have a test that passed on the code as it stands now. The other five might be fine, but nobody can say so: a test that passed last month, on code that has changed since, proves nothing about today. Intentset keeps the two numbers apart and shows both.

::::card{#under .slide .part}

{.eyebrow}
Part two

## Under the hood

{.lead}
The files, the links between them, who owns what in the code, how evidence counts, and the tools that read it all.

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
  id: BEH-ASMT-SCHEDULE
  type: behavior
  title: Schedule a student assessment
  status: draft
  owner: team-assessment
  parent: CAP-ASMT-ASSIGN
  links:
    governedBy: [RULE-ASMT-FUTURE, RULE-ASMT-AUTH]
---

# Schedule a student assessment

## Outcomes

Success: the schedule is recorded and students
gain access at the release time (…). Failure:
invalid time, unauthorized class, or unpublished
assessment is rejected without creating a schedule.
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
> This is the behavior from Lantern as a file, slightly abridged. The part between the dashes is what the tools read. The part below is what people read. Because it is just a file in the repository, it is reviewed in the same pull request as the code, reads on GitHub with nothing installed, and needs no database or hosted service.

::::card{#types .slide .dense}

{.eyebrow}
A typed model

## Thirteen record types, five groups

| Group | Types | The question it answers |
|---|---|---|
| **Why** | product, intent, outcome, measure | What are we building, why, what change would show it worked, and what reading will tell us? |
| **What** | capability, behavior, rule, scenario | What can users do, exactly what does the system do, what must stay true, and what is a concrete example? |
| **Where** | slice, contract, decision | Which part of the code delivers it, what may other parts rely on, and why was it built this way? |
| **Proof** | verification | How is a claim checked? |
| **Words** | knowledge | What may we tell a given audience? |

The behavior is the center. A rule can govern many behaviors and is written once. A scenario is a worked example: it shows the promise, and does not prove every case.

::::

{.notes}
> [!NOTE]- Speaker notes
> Two of these carry most of the weight day to day: behaviors and rules. When parts of a behavior would be released, owned or reviewed separately, they become separate behaviors. Capabilities group behaviors into what users can do. Decisions can be existing architecture decision records, given frontmatter rather than copied.

::::card{#measure .slide}

{.eyebrow}
Four questions kept apart

## Built right is not the same as worked

| Record | The question | Lantern's answer |
|---|---|---|
| **Intent** | Why are we changing the product? | Help teachers prepare learning in advance |
| **Outcome** | What observable change do we expect if it succeeds? | Teachers spend less effort preparing an assignment |
| **Measure** | What reading, against what baseline and target, will tell us? | Teacher minutes per assignment; baseline unknown; target 20% below the measured pilot baseline |
| **Verification** | Was the behavior built as described? | Valid requests recorded; invalid ones rejected without a schedule |

A behavior can pass every check and ship while its outcome is missed. Verification and measurement never stand in for each other. A baseline may honestly be *unknown*.

::::

{.notes}
> [!NOTE]- Speaker notes
> A measure names its metric, baseline, target, window and evidence source before anyone collects data. Intentset does not collect telemetry or compute the metric; the systems named as sources do that, and the reading can come back to the record later as outcome evidence.

:::::card{#links .slide .dense}

{.eyebrow}
Links

## Every link is written once

::::columns

| Record | Writes | Pointing at |
|---|---|---|
| behavior | `governedBy` → | rule |
| scenario | `illustrates` → | behavior |
| slice | `implements` → | behavior |
| verification | `verifies` → | behavior, rule, scenario |
| knowledge | `explains` → | behavior, rule, capability |

:::grid{cols=1}
- ### Validation reads, never writes

  `intentset validate`: every reference resolves, nothing loops, required sections are there.
:::

::col

:::grid{cols=1}
- ### The reverse is derived

  "Which checks cover this rule?" is worked out, never written twice, so it cannot drift.

- ### IDs are permanent

  Moving a file or rewording a title keeps the ID. A split retires the old one with `replacedBy`.
:::

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> Relationships are frontmatter fields on the record that points. The tools derive every inverse, so there is no second copy to fall out of step. Every diagnostic names the file, the field and how to fix it.

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
> Agents follow the shape of the code they are shown. If every behavior has one owning slice, an agent handed that slice's context makes a change that stays inside it. A product can even be modelled before it is built: while a slice is a draft, missing files are warnings, and approving it makes them errors. The reference profile maps this onto TypeScript and AWS Amplify Gen 2.

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

  A pass counts only on the commit under review. A repository or a release gate can ask for it.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> A verification record is a definition, not evidence: it says how to check, not that anyone did. Evidence is a run record produced by CI. Run records are never committed, because a record in the commit it assesses is stale the moment it lands. `intentset evidence stale` lists which checks need a run.

::::card{#drift .slide .dense}

{.eyebrow}
Working with agents

## The records change with the code

:::grid{cols=3}
- ### Before editing

  `intentset context <file>`

  The slice that owns the file, with its behaviors, rules, contracts, decisions and checks. Nothing outside it.

- ### While changing

  `status: draft`

  Update the records and checks in the same commit. Anything new starts as a draft.

- ### At review

  `intentset review --base main`

  Lists every slice whose code changed while its records did not. With `--fail-on-drift`, CI fails.
:::

:::grid{cols=2 .plain}
- A refactor that changes no behavior says so in its commit:

  `Intentset-Unchanged: <slice ID>`

- `intentset init` writes `.intentset/agents.md`, the guide agents follow. It tells them never to approve, publish, or invent an owner, audience or release.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> Point your agents at the guide with one line in CLAUDE.md or AGENTS.md. The drift check is what keeps the model honest over time: code cannot change quietly underneath a promise, because either the records change too, or the commit says explicitly that behavior did not.

::::card{#views .slide .dense}

{.eyebrow}
The tools

## Views of the same files

:::grid{cols=2}
- ### Impact

  `intentset impact <ID>`

  Follows the links outward to every behavior, owner, check and explanation a change could reach. Reaching is a reason to look, not proof of change.

- ### Product Atlas

  `intentset serve`

  Local review pages and a map of every record and link. Missing or stale evidence is shown as such, never folded into green.

- ### Agent context

  `intentset context` · `intentset mcp`

  The owning slice and its records, with the snapshot they came from, and nothing outside that boundary. Restricted records are withheld.

- ### Export

  `intentset graph`

  One versioned JSON export for other tools, with restricted records left out and counted. Importers read it with `readExport`.
:::

::::

{.notes}
> [!NOTE]- Speaker notes
> Everything except the files is derived. Impact helps a reviewer see what a change could touch. The Atlas is for reviewing the model as a whole. Context and the read-only MCP server give agents what they need and no more. The export is the one contract other tools build against, so importing the same snapshot twice changes nothing.

:::::card{#publish .slide}

{.eyebrow}
Published knowledge

## Tell each audience only what it may know

::::columns

`intentset publish`

Builds what one audience may see for one release, from knowledge records marked public, customer, internal or restricted.

- Denies by default, and intersects product, release, role, edition and flags
- Leaves out drafts and retired records
- Never reveals the title or path of anything it left out
- Holds an explanation for review when one of its sources changes

::col

:::card{.panel}
{.label}
Tips in the product

A knowledge record can carry one sentence per behavior it explains.

Published to `help.json`, then bound by `@intentset/help` to the control that delivers that behavior. A tooltip cannot outlive the behavior it describes.
:::

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> Customer-facing tools read only this publication, never the engineering graph. Every published document carries its provenance: the source IDs and revisions, the snapshot and the reviewer. The documents are written in Markset, which Intentset adds meaning to without adding any syntax.

::::card{#levels .slide}

{.eyebrow}
Adoption

## Adopt in levels

| Level | What it adds | What you can then claim |
|---|---|---|
| **L1** Product model | Records parse, link and read correctly | The model is well formed |
| **L2** Traceable implementation | Ownership and architecture checks | Each behavior has one owner, and the code respects it |
| **L3** Verified product | Current passing evidence | Each claim has a current pass |
| **L4** Published knowledge | Reviewed audience projections | What you publish is authorized and traceable |
| **L5** Continuous product truth | CI checks, impact reports and release automation | All of the above, kept true on every change |

Each level includes the ones before it. A claim always names its scope and snapshot: one capability passing at L3 is not a repository at L3.

::::

{.notes}
> [!NOTE]- Speaker notes
> `intentset validate --level L3` runs every check up to that level. Most teams start at L1 on one capability, add ownership and evidence as they go, and widen the scope from there.

:::::card{#practice .slide .quiet .dense}

{.eyebrow}
In practice

## Two products adopting it, in the open

::::columns

### Streamlane, a work management product

The first capability modelled, from the code, tests and decisions already there, showed what nobody had seen: two of its three rules had no test, and three behaviors were checked only in the browser.

The model is now a required check on every pull request, in strict mode.

::col

### Driftline

Modelled before any of its code existed; its first package was checked against what had been approved.

It now reads Streamlane back, counting what each of Streamlane's behaviors saw in use.

::::

:::metrics
| Count | Value |
|---|---|
| slices checked | 56 |
| records | 1,282 |
| tolerated violations, since 11 October 2026 | 0 |
:::

{.caveat}
Streamlane figures as published in the adoption log at [intentset.org/pilot](../pilot/), counted on 19 October 2026

:::::

{.notes}
> [!NOTE]- Speaker notes
> Coral Reef Ventures is adopting Intentset in two of its own products and recording what it catches, what it costs and what it changes, friction included. The [adoption log](../pilot/) on the site has the details and what it changed in the specifications.

:::::card{#try .slide .finale}

{.eyebrow}
Get started

## Try it on one capability

{.lead}
Let an agent model one capability from your code and tests, review what it wrote, and see what it finds.

::::columns{ratio="3:2"}

```sh
npm install --save-dev @intentset/cli
npx intentset init --example
npx intentset validate
npx intentset impact BEH-ASMT-SCHEDULE
```

::col

{.cta}
[intentset.org/start](../start/)

Specifications v0.2 in review. Toolchain on npm under @intentset. MIT licensed.

::::

:::::

{.notes}
> [!NOTE]- Speaker notes
> The example command sets up Lantern, the invented product from this deck, so you can run validate and impact before touching your own repository. The [start page](../start/) on intentset.org walks through modelling your first real capability.
