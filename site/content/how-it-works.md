---
markset: 0
---

{.eyebrow}
How it works

# How Intentset works

{.lead}
Intentset has two halves. One is a set of conventions for writing down what your product does, as ordinary files your agents keep beside the code. The other is a toolchain that reads those files and tells you, plainly, whether the code, the tests and the explanations you publish still agree with them.

This page walks through it in the order you would meet it: the files, the model they form, how ownership and evidence attach to it, and what the tools do with the result.

## The short version

:::steps
1. **Write records.** Each behavior, rule, slice and check is a Markdown file with YAML frontmatter, written by the agent that changes the code and reviewed in the same pull request.
2. **Link them once.** A record names what it points at. Intentset works out the reverse, so every behavior knows its rules, its owner, its checks and its explanations.
3. **Give each behavior one owner.** A slice of your code is accountable for it, and an architecture check keeps other code out of that slice's internals.
4. **Attach evidence.** Test runs from CI are tied to a commit, and only a pass on the commit under review counts.
5. **Review the impact.** Before a change merges, see every behavior, owner, check and explanation it could reach.
6. **Publish safely.** Reviewed explanations go out for one audience and one release, and nothing internal leaks through.
7. **Hand it on.** Other tools read the model through one versioned export, with restricted records left out.
:::

## Written by agents, reviewed by people

The records are meant to be written by the coding agents that change the code, in the same commit, and read by people. That division is the point. A change that runs to thousands of lines of code is a few dozen lines of records, in product language, that a person can review and question.

`intentset init` writes `.intentset/agents.md`, the guide an agent follows, and one line in CLAUDE.md or AGENTS.md points your agents at it. It tells them to:

- load what the code promises before changing it: `intentset context <file>` gives the slice that owns the file, with its behaviors, rules, scenarios, contracts, decisions and checks;
- update those records and their checks in the same commit when behavior changes, and start anything new as a draft;
- say so in the commit when behavior does not change, with an `Intentset-Unchanged` trailer naming the slice;
- never approve, publish, or invent an owner, audience or release.

`intentset review` lists every slice whose code changed while none of its records did. A refactor answers with the trailer, where the reviewer reads it; with `--fail-on-drift`, anything left unanswered fails CI. Approval stays with people: only a person moves a record from draft to approved, and validation passing never counts as approval.

## Open files. Explicit meaning

Every artifact in the model is one Markdown file with YAML frontmatter. The frontmatter is the part tools read: a stable ID, a type, a status, an owner, the audiences it is written for, and its links. The body is the part people read, with the sections its type requires. A behavior, for example, has to say who acts, what triggers it, what happens when it succeeds, and what happens when it fails.

```markdown
---
markset: 0
intentset:
  spec: "0.1"
  profile: intentset/behavior/0.1
  id: BEH-ASMT-SCHEDULE
  type: behavior
  title: Schedule a student assessment
  status: draft
  owner: team-assessment
  visibility: internal
  audiences: [engineering, product]
  parent: CAP-ASMT-ASSIGN
  links:
    governedBy: [RULE-ASMT-FUTURE, RULE-ASMT-AUTH]
  # availability: the products, releases, roles and editions it applies to
---

# Schedule a student assessment

## Behavior
A teacher submits a future release time for a published student assessment and a class.

## Preconditions
The teacher may assign to the class, the assessment is published,
and the requested time is in the future.

## Outcomes
Success: the schedule is recorded. Failure: an invalid time, an
unauthorized class or an unpublished assessment is rejected, and
no schedule is created.
```

Keeping the model in files is a deliberate choice, and it has consequences worth knowing:

- Records are reviewed in the same pull request as the code they describe, by the same people.
- They read on GitHub, in an editor or in a terminal, with nothing installed.
- The repository is the source of truth. The graph, the reports, the Atlas and the published pages are views rebuilt from these files, and no tool ever rewrites them.
- There is no database and no hosted service to run.

## A typed model, centered on behavior

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

The reverse is never written down. "Which slice implements this behavior?" and "which checks cover this rule?" are worked out from the forward links, so there is no second copy to drift out of step with the first.

IDs are permanent. Moving a file or rewording a title keeps the ID. Splitting a behavior creates new IDs and retires the old one with a `replacedBy` link, so history still resolves.

`intentset validate` checks the model: every reference resolves to a record of the right type, nothing loops, every active rule governs something, and every type has its required sections. Each diagnostic names the file, the field and how to fix it. Validation reads and reports. It never runs your code, calls the network or changes a file.

## Each behavior has one owner in the code

This part comes from the Traceable Vertical Slice Architecture specification. It is optional: the model above stands on its own, and you can add ownership later.

A slice is the part of the codebase accountable for a set of behaviors, end to end: interface, logic, backend access, tests and documentation. Every behavior past the draft stage has exactly one. Other slices may collaborate, but through declared contracts rather than by reaching into each other's files.

The slice record says which files it owns, which entrypoints are its public surface, and how its internal layers may depend on one another. `intentset architecture check` reads your imports and reports what breaks that declaration:

- another slice importing a private file instead of an entrypoint
- a dependency between slices that nobody declared, or a cycle between them
- a layer importing one it is not allowed to
- two slices claiming the same file
- product behavior living in shared or infrastructure code

A real codebase rarely starts clean, so adoption is by scope. Record today's violations as a baseline, block new ones, and retire the baseline over time.

A product can also be modelled before it is built. While a slice is a draft, an entrypoint that does not exist yet and a claim that matches no file are warnings, so the check passes from the first commit. Approving the slice makes them errors.

The reference profile maps all of this onto TypeScript and AWS Amplify Gen 2. A large Amplify backend reaches CloudFormation's resource limits whatever its slices look like, so the profile also covers a backend split into areas, each its own Amplify backend behind one AppSync Merged API. The architecture check then keeps each slice, schema and import inside its area.

## Verified means passing now

A verification record defines how a claim is checked: an automated test, named by its file and a stable selector, or a manual review procedure. That definition is not evidence. It says how to check, not that anyone did.

Evidence is a separate run record: this check, on this commit, against this version of the graph, in this environment, passed, failed, was skipped or errored. `intentset evidence import` turns a Vitest or node test report from CI into run records.

> [!NOTE] Linked is not verified
> Only a pass on the commit under review counts. A pass from an earlier commit is stale, and skipped, errored and missing runs never count as passing. Reports always show two numbers side by side: how many claims have a check linked, and how many have a current pass.

Keep run records in CI or another store you control, never in the commit they assess. A record committed to the repository describes a commit that stops being the latest the moment it lands.

## See what a change reaches

`intentset impact` starts at any record and follows the links outward: the behaviors that depend on it, the slices that own them, the checks that verify them and the knowledge that explains them. Governing rules, contracts and decisions come along as context for the reviewer. Direct effects are kept apart from candidates further away, and every result says which path reached it. Reaching something is a reason to look at it, not proof that it changed.

`intentset review --base main` gathers the same picture for a branch: the checks, the coverage, and the impact of everything that changed.

## Hand the model to other tools

`intentset graph` writes the model as one JSON export for other tools to import: the graph and, on request, evidence, knowledge, impact and ownership reports. Restricted records are left out by default, and every omission is counted, so a reader knows something was withheld without learning what. The export names the commit and graph it was built from, so importing the same snapshot twice changes nothing.

A tool reads it with `readExport` from `@intentset/core`, which rejects an export it cannot trust and says why. The conformance suite carries valid and deliberately broken exports for testing an importer. Streamlane will use the export to link work items to the behaviors they change, and Driftline to attribute usage and errors to slices and behaviors. [Read the export contract](../specifications/export/index.html).

## Context for agents, with limits

An agent about to change code should know what that code promises, and nothing it has no business reading. `intentset context` and the read-only MCP server hand it the owning slice and its behaviors, rules, scenarios, contracts and decisions, with the snapshot and source paths they came from, and nothing outside that boundary. Restricted records are withheld unless an operator includes them.

## Rich documents, with Markset

Knowledge records are explanations written for an audience, such as teachers. Each carries a visibility (public, customer, internal or restricted) and the products, releases, roles, editions and feature flags it applies to.

`intentset publish` builds what one audience may see for one release. It denies by default, intersects every availability dimension, leaves out drafts and retired records, and never reveals the title or path of anything it excluded. The output is a set of Markset documents that carry their provenance: the source IDs and revisions, the snapshot and the reviewer. When a source changes, the explanations that depend on it are marked for review before they can be published again. Customer-facing tools read only this publication, never the engineering graph.

A knowledge record can also carry tips: one sentence per behavior it explains, for the product to show beside the control that delivers it. They are reviewed and published with the record, so a tooltip cannot outlive the behavior it describes. Each publication writes them to a `help.json` the product reads with `@intentset/help`, which binds every tip to the element naming its behavior and reports the behaviors that have no tip yet.

Markset provides the document format, and Intentset adds metadata and meaning to it without adding any syntax. [See how Markset fits](../markset/index.html).

## The Atlas: the model, for review

`intentset serve` builds the Product Atlas, local pages for reviewing the model: capabilities and behaviors, owners, verification status and publication readiness. Every count says what it counts (linked checks or current passes), over which scope and which snapshot. Missing or stale evidence is shown as missing or stale, never folded into a green status.

## Adopt in levels

Conformance comes in five levels, each including the ones before it. Start at the first and stop wherever the value runs out.

| Level | What it adds | What you can then claim |
|---|---|---|
| L1 Product model | Records parse, link and read correctly | The model is well formed |
| L2 Traceable implementation | Ownership and architecture checks | Each behavior has one owner, and the code respects it |
| L3 Verified product | Current passing evidence | Each claim passed on this commit |
| L4 Published knowledge | Reviewed audience projections | What you publish is authorized and traceable |
| L5 Continuous product truth | CI checks, impact reports and release automation | All of the above, kept true on every change |

`intentset validate --level L3` runs every check up to that level. A claim always names its scope and snapshot: one capability passing at L3 is not a repository at L3.

## What it does not do

- It does not prove the product correct. A linked, passing test can still assert the wrong thing, and people judge whether a check is adequate.
- It does not need a database, a hosted service, a particular test framework or a cloud.
- It does not replace your issue tracker. Tickets describe changes; records describe the behavior that persists after them.
- It is not a plan for one task. A spec written to drive one change is useful for that change and then goes stale. Records describe the product as it stands, outlive every change, and are checked on every commit.
- It does not run your code, call the network or edit your files when it validates, builds the graph, checks architecture or reports impact.

## Try it on the example

:::tabs
### npm
```sh
npm install --save-dev @intentset/cli
npx intentset init --example
npx intentset validate
npx intentset impact BEH-ASMT-SCHEDULE
```

### pnpm
```sh
pnpm add --save-dev @intentset/cli
pnpm exec intentset init --example
pnpm exec intentset validate
pnpm exec intentset impact BEH-ASMT-SCHEDULE
```
:::

[[Start with one capability](../start/index.html)]{.button .primary} [[Read the Core specification](../specifications/core/index.html)]{.button}
