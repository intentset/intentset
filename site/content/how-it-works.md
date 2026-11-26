---
markset: 0
---

{.eyebrow}
How it works

# How Intentset works

{.lead}
For whoever will set Intentset up, or decide that it fits a team: the files your agents write, what CI checks, what a reviewer reads, what adopting it costs and what it does not do. The second half of the page is the full model, part by part, for reference.

Intentset has two halves. One is a set of conventions for writing down what your product does, as ordinary files your agents keep beside the code. The other is a toolchain that reads those files and tells you, plainly, whether the code, the tests and the explanations you publish still agree with them. Each file is a record, and together a product's records are its model: a set of files, not an AI model.

Deciding whether the idea is for you at all? [The home page](../) starts with the problem it solves, or you can [page through the introduction](../introducing/), a slide deck that explains the idea in plain words before it reaches the files and tools.

## The short version

:::steps
1. **Write records.** Each behavior, rule, slice and check is a Markdown file with YAML frontmatter, written by the agent that changes the code and reviewed in the same pull request.
2. **Link them once.** A record names what it points at. Intentset works out the reverse, so every behavior knows its rules, its owner, its checks and its explanations.
3. **Give each behavior one owner.** A slice of your code is accountable for it, and an architecture check keeps other code out of that slice's internals.
4. **Attach evidence.** Test runs from CI are tied to a commit. A pass counts while what it checked is unchanged, and a gate can ask for a pass on the commit under review.
5. **Review the impact.** Before a change merges, see every behavior, owner, check and explanation it could reach.
6. **Publish safely.** Reviewed explanations go out for one audience and one release, and nothing internal leaks through.
7. **Hand it on.** A tool reads the model from your repository, or from one versioned export with restricted records left out.
:::

{#alongside}
## What it is not, and what you already have

You already have tests, pull request summaries, instructions for your agents, decision records, docs and tickets. Intentset replaces none of them:

- **Tests.** A test checks the code, and an agent often changes it in the same commit as the code. A record says what the test is meant to hold, and Intentset reports whether it passed on the code as it stands.
- **Pull request summaries.** A summary is written from the diff, by the agent that made it. `intentset review` starts from what the records say changed.
- **CLAUDE.md and AGENTS.md.** They say how to work in the repository, not what the product promises. One line in either points your agents at the guide Intentset writes.
- **Decision records.** An existing one joins the model as a decision record by gaining frontmatter, its text unchanged.
- **Docs and help articles.** They go out of date without anyone noticing. A knowledge record, an explanation written for one audience, is held for review when what it explains changes.

It ties them to what the product promises, and fails CI when the code and the records come apart. Nor is it any of these:

- It does not prove the product correct. A linked, passing test can still assert the wrong thing, and people judge whether a check is adequate.
- It is not a test runner: it reads your test reports.
- It does not need a database, a hosted service, a particular test framework or a cloud.
- It does not replace your issue tracker. Tickets describe changes; records describe the behavior that persists after them.
- It is not a plan for one task. A spec written to drive one change is useful for that change and then goes stale. Records describe the product as it stands, outlive every change, and are checked on every commit.
- It does not run your code, call the network or edit your files when it validates, builds the graph, checks architecture or reports impact.

## One record

Lantern, the example on this page and across the site, is an invented school product, where teachers schedule assessments for their classes. This is one of its behaviors, the file exactly as it is in the worked example:

```markdown
---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ASMT-SCHEDULE
  type: behavior
  title: Schedule a student assessment
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  parent: CAP-ASMT-ASSIGN
  links:
    governedBy:
    - RULE-ASMT-FUTURE
    - RULE-ASMT-AUTH
  availability:
    products:
    - PRD-LANTERN
    releases:
    - pilot-1
    roles:
    - teacher
    editions:
    - standard
    flags: []
---

# Schedule a student assessment

## Behavior

A teacher submits a future release time for a published assessment and a class.

## Preconditions

The teacher is authorized to assign to the class. The assessment is published and the requested time is in the future.

## Outcomes

Success: the schedule is recorded and students gain access at the release time under the eventual implementation tolerance. Failure: invalid time, unauthorized class, or unpublished assessment is rejected without creating a schedule. Delivery tolerance, cancellation, and retry semantics remain draft decisions.
```

Your agent writes the part between the `---` lines; you read the part below it.

Every record in the model is one Markdown file with YAML frontmatter. The frontmatter is the part tools read: a stable ID, a type, a status, an owner, the audiences it is written for, and its links. The body is the part people read, with the sections its type requires. A behavior, for example, has to say who acts, what triggers it, what happens when it succeeds, and what happens when it fails.

Keeping the model in files is a deliberate choice, and it has consequences worth knowing:

- Records are reviewed in the same pull request as the code they describe, by the same people.
- They read on GitHub, in an editor or in a terminal, with nothing installed.
- The repository is the source of truth. The graph, the reports, the Atlas and the published pages are views rebuilt from these files, and no tool ever rewrites them.
- There is no database and no hosted service to run.

A record's status says where it stands with people: a draft until a person approves it, then implemented, released, and in time deprecated or retired. An optional `delivery` says something else, whether the work it describes exists: `planned` on a record that proposes work, `built` on one written from code that is already there. An agent may write it, because it states a fact about the code; only a person approves.

A record can also say how it came to be approved. An optional `approval` names who approved it, when, and on what basis: a person read this record, or it was derived from something a person approved, such as a work item in another tool, or an agent attested it and no person has. A behavior, rule or scenario can name the outside requirement it `formalizes`. Intentset checks the form of both and holds no policy on either: it never decides who may approve, and it never opens what a record points at.

## What CI checks, and what a failure says

CI runs two commands on every pull request, the ones step 7 of [Try it on your code](../start/) adds:

```sh
npx intentset validate --level L2
npx intentset review --base origin/main --fail-on-drift
```

The first checks the records and the boundaries in the code. The second compares the branch with main: what the change could reach, every record whose status or approval changed, and each [slice]{.term tip="The part of the code accountable for a set of behaviors: the files it claims, and the entrypoints other code may use."} whose code changed while none of the records that describe it did.

Say an agent changes Lantern's release-time check to accept a time up to an hour in the past, and changes nothing else. The review exits with code 1, and this is the part of its report that says why:

```text
## Code changed, records unchanged (1, 1 not acknowledged)

Slices whose code changed while none of the records that describe them did: the slice, its behaviors, their rules, scenarios and verifications, its contracts and their decisions. If behavior changed, update those records in this change. If it did not, say so in a commit with the trailer `Intentset-Unchanged: <slice ID>`.

### SLICE-ASMT-SCHEDULE: Student assessment scheduling slice

- Not acknowledged: update the records below, or say in a commit that no behavior changed.
- Code changed: src/features/assessment/schedule/domain/policies/release-time.ts
- Records describing it, none changed: ADR-ASMT-SEAM, BEH-ASMT-SCHEDULE, CONTRACT-ASMT-SCHEDULE, RULE-ASMT-AUTH, RULE-ASMT-FUTURE, SCN-ASMT-SCHEDULE, SLICE-ASMT-SCHEDULE, TEST-ASMT-SCHEDULE
```

{.small .muted}
Real output of `intentset review --base origin/main --fail-on-drift` at {{version}}, run in a scratch repository holding the worked example's records and the data file its registry names, with one file of code added on a branch. The change is illustrative, and Lantern is invented. The report's other sections are left out.

That is drift: code changed and its records did not. There are two ways through, and both pass the same command:

- **The behavior changed.** The agent updates the records in the same change, and the reviewer reads one changed line of the rule beside the code:

  ```diff
  -The authoritative server time must be earlier than the requested release time when the schedule is accepted.
  +The requested release time must be no more than one hour before the authoritative server time when the schedule is accepted.
  ```

  The teachers' guide explains that rule, so the same edit holds it for review: `intentset validate --level L4` reports that it needs review because RULE-ASMT-FUTURE changed since it was reviewed.
- **It did not**, as in a refactor. A commit says so in its message's last paragraph, `Intentset-Unchanged: SLICE-ASMT-SCHEDULE`, and the review lists the slice as acknowledged. The claim is made where a reviewer reads it and can question it.

## Written by agents, reviewed by people

The records are meant to be written by the coding agents that change the code, in the same commit, and read by people. That division is the point. A change that runs to thousands of lines of code is a few dozen lines of records, in product language, that a person can review and question.

`intentset init` writes `.intentset/agents.md`, the guide an agent follows, and one line in CLAUDE.md or AGENTS.md points your agents at it. It tells them to:

- load what the code promises before changing it: `intentset context <file>` gives the slice that owns the file, with its behaviors, rules, scenarios, contracts, decisions and checks;
- update those records and their checks in the same commit when behavior changes, and start anything new as a draft;
- say so in the commit when behavior does not change, with an `Intentset-Unchanged` trailer naming the slice;
- never approve, publish, or invent an owner, audience or release.

Approval stays with people: only a person moves a record from draft to approved, and validation passing never counts as approval. `intentset approve <ID>... --by <person>` writes `status: approved` and an approval block, naming that person and the date, into each draft it is given. It first checks that the model still validates with the change, and writes nothing if that would add an error. It refuses a tree with uncommitted changes, so the approval is a diff of its own, and it commits nothing: the pull request's reviewer reads the approval like any other change, and `review` lists every record whose status or approval changed.

{#cost}
## What adopting it costs

- **One capability.** An agent writes it from the code you already have, and you review about eight files. On a fresh TypeScript repository with one feature and three tests, the steps on [Try it on your code](../start/) take five minutes.
- **Every change.** The agent updates the records in the same commit, or adds a trailer line saying no behavior changed. In the first of Coral Reef Ventures' own products to adopt it, the check ran 367 times on its pull requests from 2026-10-07 to 2026-10-10, and 355 of 367 runs passed without anyone noticing the gate was there. Nine of the failures were drift, and each passed once a commit added one trailer per slice.
- **Existing debt.** In the same product, the architecture check found 472 violations when it was switched on, on 2026-10-06. They were written down as a [baseline]{.term tip="The list of violations that existed when a rule started applying. They are tolerated; any new one fails."} that could only shrink, and it reached zero on 2026-10-11, while the product grew from 37 slices to 43.
- **A whole product.** Modelling a product that already exists is a team's work for a long time. [Modelling the whole product](../adopt/) is how one person running many agents does it.

[The adoption log](../pilot/) has each figure with its source and date.

## Adopt in levels

Conformance comes in five levels, each including the ones before it. Start at the first and stop wherever the value runs out.

| Level | What it adds | What you get | What you can then claim |
|---|---|---|---|
| L1 Product model | Records parse, link and read correctly | A list of what the product promises, checked for gaps | The model is well formed |
| L2 Traceable implementation | Ownership and architecture checks | A change that reaches into another slice's private code fails | Each behavior has one owning slice, and the code respects it |
| L3 Verified product | Current passing evidence | You can see which promises pass now | Each promise has a current pass |
| L4 Published knowledge | Reviewed help for each audience | Help is held for review when what it explains changes | What you publish is authorized and traceable |
| L5 Continuous product truth | CI checks, impact reports and release automation | All of it, on every pull request | All of the above, kept true on every change |

`intentset validate --level L3` runs every check up to that level. Its levels stop at L4: L5 is a claim about how a repository runs its checks, not a level `validate` runs. A conformance claim always names its scope and the commit it was made at: one capability passing at L3 is not a repository at L3.

***

{.eyebrow}
In detail

The rest of this page is the full model, part by part, for reference.

## A typed model, centered on behavior

Day to day, most of the work is two types: behaviors and rules. The rest you add when you need them.

There are thirteen record types. They fall into five groups, each answering a different kind of question:

| Group | Types | The question it answers |
|---|---|---|
| Why | product, intent, outcome, measure | What are we building, why, what change would show that it worked, and what reading will tell us? |
| What | capability, behavior, rule, scenario | What can users do, exactly what does the system do, what must stay true, and what is a concrete example? |
| Where | slice, contract, decision | Which part of the code delivers it, what may other parts rely on, and why was it built this way? |
| Proof | verification | How is a claim checked? |
| Words | knowledge | What may we tell a given audience? |

The behavior is the center of the model. It is one recognizable promise, including how it fails: *schedule a student assessment for a future time*, rather than *student assessments*. When parts of a behavior would be released, owned or reviewed separately, they are separate behaviors. A rule can govern many behaviors and is written once, not copied into each. A scenario is a worked example; it shows the promise, and it does not prove every case.

People arrive from different ends and meet at the same records. A product reviewer starts at the top and drills down, from product to intent, outcome, capability and behavior. An engineer starts from the slice they are working in. Both end up reading the same behavior.

## Intent, outcome, measure, verification

The four records above a behavior and below it answer four questions that are easy to run together, and keeping them apart is most of the point:

| Record | The question | Lantern's answer |
|---|---|---|
| Intent | Why are we changing the product? Its Rationale names the problem or opportunity. | Teachers do last-minute administrative work; prepare learning in advance. |
| Outcome | What observable change do we expect if the work succeeds? | Teachers spend less effort preparing an assignment. |
| Measure | What reading, against what baseline and target, in what window, from what source, will tell us? | Teacher minutes per assignment, baseline unknown, target 20% below the pilot baseline, read 90 days after the pilot, from an observed task study. |
| Verification | Was the behavior built as described? | A reviewed procedure over scheduling: valid requests recorded, invalid ones rejected without a schedule. |

A measure is a record of its own, under its outcome, with its metric, baseline, target, window and source in frontmatter. The baseline may be the word `unknown`, and that is the honest record of a gap rather than a reason to leave the field out. The source must be in the repository's registry of evidence sources, so a measure names where its evidence is expected to come from before anyone collects it. An outcome past draft needs at least one measure.

Verification and measurement never stand in for each other. A behavior can be implemented correctly, pass every check and ship, and the outcome above it can still be missed. Intentset says what success means and keeps that beside the behaviors meant to produce it. Collecting telemetry, running the query and computing the metric belong to the systems the registry names, and the reading can come back to the record later as outcome evidence.

## Every link is written once

Relationships are frontmatter fields, written on the record that points:

- a behavior is `governedBy` its rules
- a scenario `illustrates` a behavior
- a slice `implements` behaviors, and `exposes` or `consumes` contracts
- a verification `verifies` behaviors, rules or scenarios
- a knowledge record `explains` behaviors, rules or capabilities

The reverse is never written down. "Which slice implements this behavior?" and "which checks cover this rule?" are worked out from the forward links, so there is no second copy to fall out of step with the first.

IDs are permanent. Moving a file or rewording a title keeps the ID. Splitting a behavior creates new IDs and retires the old one with a `replacedBy` link, so history still resolves.

`intentset validate` checks the model: every reference resolves to a record of the right type, nothing loops, every active rule governs something, and every type has its required sections. Each diagnostic names the file, the field and how to fix it. Validation reads and reports. It never runs your code, calls the network or changes a file.

## Each behavior has one slice in the code

Agents follow the shape of the code they are shown. Intentset gives every behavior one owning slice and checks the boundaries between slices on every change: another slice's private files, dependencies nobody declared, layers out of order, product rules hiding in shared code. An agent handed one slice's context makes a change that stays in that slice.

This part comes from the Traceable Vertical Slice Architecture specification. It is optional: the model above stands on its own, and you can add ownership later.

A slice is the part of the codebase accountable for a set of behaviors, end to end: interface, logic, backend access, tests and documentation. Every behavior past the draft stage has exactly one. Other slices may collaborate, but through declared contracts rather than by reaching into each other's files.

The slice record says which files it owns, which entrypoints are its public surface, and how its internal layers may depend on one another. `intentset architecture check` reads your imports and reports what breaks that declaration:

- another slice importing a private file instead of an entrypoint
- a dependency between slices that nobody declared, or a cycle between them
- a layer importing one it is not allowed to, directly or through an entrypoint or any other file that passes the import on
- a business rule, a model or the code that calls the backend importing an interface framework or rendering markup
- two slices claiming the same file
- product behavior living in shared or infrastructure code

A real codebase rarely starts clean, so adoption is by scope. Record today's violations as a baseline, block new ones, and retire the baseline over time, so debt is a number you can watch fall. A baseline may shrink and may not grow: an entry whose violation is gone fails until it is removed, an import is held one imported name at a time, and `intentset review` lists every entry a change added.

A product can also be modelled before it is built. While a slice is a draft, an entrypoint that does not exist yet and a claim that matches no file are warnings, so the check passes from the first commit. Approving the slice makes them errors.

The reference profile maps all of this onto TypeScript and AWS Amplify Gen 2. A large Amplify backend reaches CloudFormation's resource limits whatever its slices look like, so the profile also covers a backend split into areas, each its own Amplify backend behind one AppSync Merged API. The architecture check then keeps each slice, schema and import inside its area.

## Verified means passing now

A verification record defines how a claim is checked: an automated test, named by its file and a stable selector, or a manual review procedure. That definition is not evidence. It says how to check, not that anyone did.

Evidence is a separate run record: this check, on this commit, against this version of the graph, in this environment, passed, failed, was skipped or errored. `intentset evidence import` turns a Vitest, Playwright or node:test (TAP reporter) report from CI into run records.

> [!NOTE] Linked is not verified
> Only a pass whose binding holds counts. By default a pass counts while what its check is about is unchanged: the behavior, the slices that deliver it and the files they claim, the test and what it imports. A repository, or a release gate, can ask for the stricter rule, a pass on the commit under review. A pass that no longer holds is stale, and skipped, errored and missing runs never count as passing. Reports always show two numbers side by side: how many claims have a check linked, and how many have a current pass.

`intentset evidence stale` lists the automated checks that have no current pass, and can print them as the arguments that make Vitest, Playwright or node:test run only those tests.

Keep run records in CI or another store you control, never in the commit they assess. A record committed to the repository describes a commit that stops being the latest the moment it lands.

## See what a change reaches

`intentset impact` starts at any record and follows the links outward: the behaviors that depend on it, the slices that own them, the checks that verify them and the knowledge that explains them. Governing rules, contracts and decisions come along as context for the reviewer. Direct effects are kept apart from candidates further away, and every result says which path reached it. Reaching something is a reason to look at it, not proof that it changed.

`intentset review --base main` gathers the same picture for a branch: the checks, the coverage, and the impact of everything that changed.

## Ask the records a question

`intentset list` answers which records match: by type, status, delivery, owner, audience, availability, or a link to another record. Fields combine with AND and the values of one field with OR, and there is no query language to learn. `intentset list --status draft --delivery built` lists the drafts that describe code that exists, and `--count-by` counts the matches by one field. It reads the repository or an export and gives the same answer from either, and where a match depends on a record that is withheld, it says the answer is undetermined rather than guess. [Read the list contract](../specifications/list/).

Linked records answer questions that no single file can. These are some, by who asks them, each with the commands that answer it today:

::::grid{cols=2}
- :::card[For product managers]
  - What does the product promise today, and what changed this week?
  - Does this new requirement contradict a rule we already keep?
  - Which promises have no check passing on this release?

  {.small}
  `list --type behavior`; `review --base <ref>`; `evidence stale --release <product>:<label>`. Whether a requirement contradicts a rule is a person's call: `list --type rule` gives them the rules to read.
  :::
- :::card[For engineers]
  - Which slice owns this file, and what does it promise?
  - What could this change reach: behaviors, owners, checks, explanations?
  - Are the boundaries holding, and is the debt going down?

  {.small}
  `context <file>`; `impact <ID>` and `review`; `architecture check`, which counts the baselined violations.
  :::
- :::card[For whoever writes the help]
  - What may we tell this audience about this release?
  - Which explanations went out of date when that rule changed?
  - Where did this answer come from, and who reviewed it?

  {.small}
  `publish` for one audience and release; `validate --level L4`, which names each approved explanation whose sources changed since its review; the provenance every published document carries, naming its source record and its reviewer.
  :::
- :::card[For agents]
  - What must I read before I edit this file?
  - Which records does my change have to update?
  - What am I not allowed to decide?

  {.small}
  `context <file>`, or the read-only MCP server, `mcp`; `review`, whose drift section names the records; the guide's Never list, in `.intentset/agents.md`.
  :::
::::

## Hand the model to other tools

A tool can read the records in your repository directly, or read the export. [What reads an Intentset model](../tools/readers/) says what each path needs from your repository.

`intentset graph` writes the model as one JSON export for other tools to import: the graph and, on request, evidence, knowledge, impact and ownership reports. Restricted records are left out by default, and every omission is counted, so a reader knows something was withheld without learning what. The export names the commit and graph it was built from, so importing the same snapshot twice changes nothing.

A tool reads it with `readExport` from `@intentset/core`, which rejects an export it cannot trust and says why. The conformance suite carries valid and deliberately broken exports for testing an importer. A usage tool can read a product's export to attribute the usage it sees to that product's behaviors. [Read the export contract](../specifications/export/).

## Context for agents, with limits

An agent about to change code should know what that code promises, and nothing it has no business reading. `intentset context` and the read-only MCP server hand it the owning slice and its behaviors, rules, scenarios, contracts and decisions, with the snapshot and source paths they came from, and nothing outside that boundary. Restricted records are withheld unless an operator includes them.

## Rich documents, with Markset

Knowledge records are explanations written for an audience, such as teachers. Each carries a visibility (public, customer, internal or restricted) and the products, releases, roles, editions and feature flags it applies to.

`intentset publish` builds what one audience may see for one release. It denies by default, intersects every availability dimension, leaves out drafts and retired records, and never reveals the title or path of anything it excluded. The output is a set of Markset documents that carry their provenance, the source IDs, revisions and hashes and the reviewer, beside a help file of their tips and one small file that names the snapshot for the whole publication, so every other file changes only when what it was made from changes, and published output can be committed without each commit rewriting it. When what a source promises changes, the explanations that depend on it are marked for review before they can be published again. A review can pin each source's content rather than its whole file, so approving a source or marking it built leaves the explanation current, while editing what it promises, or deprecating or retiring it, does not. Customer-facing tools read only this publication, never the engineering graph.

A knowledge record can also carry tips: one sentence per behavior it explains, for the product to show beside the control that delivers it. They are reviewed and published with the record, so a tooltip cannot outlive the behavior it describes. Each publication writes them to a `help.json` the product reads with `@intentset/help`, which binds every tip to the element naming its behavior, once or for as long as it watches the page, and reports the behaviors that have no tip yet. The product chooses how a tip is shown, so it can reach keyboard, touch and screen-reader users as well as a mouse.

Markset provides the document format, and Intentset adds metadata and meaning to it without adding any syntax. [See how Markset fits](../markset/).

## The Atlas: the model, for review

`intentset serve` builds the Product Atlas, local pages for reviewing the model at http://127.0.0.1:3000/: every record with its text and its links, capabilities and behaviors, owners, verification status and publication readiness. Every count says what it counts (linked checks or current passes), over which scope and which snapshot. Missing or stale evidence is shown as missing or stale, never folded into a green status. [Lantern's map](../example/atlas/map/) is the worked example's Atlas: every record and every link between them in one picture, with the review pages beside it.

## After the repository

Everything above happens in your repository and stops at a merged, checked change. After it, the change reaches production, people use it, and what you learn comes back as new intent. Intentset does none of that, by design. It fixes the record IDs, the evidence binding and the export, so that a tool that does can say which behavior it is talking about.

- A behavior is the promise a person approves. In your repository, `intentset approve` writes that approval as a diff, so anything that reads the repository can tell an approved behavior from a draft.
- A rule is written once and governs many behaviors, so a refusal can name the rule it keeps.
- A check's run records say what passed and whether that pass still holds. Published from CI, they can be read outside the repository.
- Code that changes without its records is drift. CI fails on it.
- The usage-evidence format, one line per call naming the behaviors it exercised and never a person, is a draft and is not published here yet.

## Try it on the example, in a scratch directory

Lantern's records go in a new, empty directory, not your repository, where they would join your own model:

:::tabs
### npm
```sh
mkdir intentset-demo && cd intentset-demo
npm init -y
npm install --save-dev @intentset/cli
npx intentset init --example
npx intentset validate
npx intentset impact BEH-ASMT-SCHEDULE
npx intentset serve
```

### pnpm
```sh
mkdir intentset-demo && cd intentset-demo
pnpm init
pnpm add --save-dev @intentset/cli
pnpm exec intentset init --example
pnpm exec intentset validate
pnpm exec intentset impact BEH-ASMT-SCHEDULE
pnpm exec intentset serve
```
:::

`init --example` writes Lantern's 15 records under `product/scheduling/`, `impact` follows the links out from its one behavior, and `serve` shows the records as the Atlas at http://127.0.0.1:3000/ until you stop it.

## Who is adopting it

Coral Reef Ventures is adopting Intentset in two of its own products, Streamlane (Product · In development) and Driftline (Product · In planning). Neither is released; [the adoption log](../pilot/) records what Intentset has done in both.

[[Try it on your code](../start/)]{.button .primary} [[Read the Core specification](../specifications/core/)]{.button}
