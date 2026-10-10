# Keeping the product model current

This repository keeps an Intentset product model: one Markdown file per product intent, outcome, measure, capability,
behavior, rule, scenario, slice, contract, decision, verification and knowledge article, under `product/**/*.md`. The records
say why the product is changing, what the change should produce and how that will be measured, what the product
promises, which code delivers it and how it is checked. You keep them true as part of every change, in the same commit as the
code, so that people can review what the product does without reading every line of what changed.

Written by `intentset init` (intentset 0.6.1). To refresh it, delete it and run
`pnpm exec intentset init --agents`; `pnpm exec intentset guide` prints it without writing a file.

## Before you change code

Load what the code you are about to change promises:

```sh
pnpm exec intentset context <a file you will edit>
pnpm exec intentset context <an ID, such as BEH-...>
```

The result is the owning slice, its behaviors, rules, scenarios, contracts, decisions and checks, with their paths.
Keep the change inside that slice, and reach other slices only through the contracts it consumes.

## When behavior changes

Update the records in the same change as the code.

- A changed promise: edit the behavior's Behavior, Preconditions and Outcomes, and the rules and scenarios it
  touches.
- A new promise: add a behavior record with `status: draft`, and add its ID to `implements` on the slice that
  delivers it. New rules, scenarios and verifications start as drafts too.
- New code that no slice claims: add a slice record with `status: draft`, its claims and its entrypoints. While a
  slice is a draft, the paths it plans may not exist yet.
- A changed check: a verification record names the test that checks a claim. Change the test and its record
  together, and add one for a behavior or rule that has none.

Write each link once, on the record that points: a behavior is `governedBy` its rules, a scenario `illustrates`
a behavior, a slice `implements` behaviors, a verification `verifies` what it checks. Never write the reverse.

## When behavior does not change

A refactor changes code and no behavior. Say so in the commit message with a trailer naming each slice:

```text
Intentset-Unchanged: SLICE-...
```

`intentset review` lists every slice whose code changed while its records did not, and this trailer is how a
commit answers it. Use it only when no behavior changed: a reviewer reads it as your claim. Git reads trailers only
from a message's last paragraph, so put it there, beside any other trailer such as `Co-Authored-By`; in a paragraph
of its own above them, it is not read.

## Never

- Set a status to approved, implemented or released, or publish knowledge. People approve, and validation passing
  is not approval.
- Change an ID or reuse a retired one. Moving or renaming a file keeps its ID; splitting a behavior retires the old
  one with `replacedBy`.
- Name an owner, audience, release, role, edition, flag or evidence source that is not in
  `.intentset/registries.yaml`. Ask instead.
- Treat a passing check as the outcome achieved. Verification says the behavior was built as described; a measure
  says whether building it produced the outcome, and only evidence read in its window answers that.
- Commit run evidence (`.intentset/evidence/`) or an export. They describe one commit and are stale once it lands.
- Edit generated output: an export, the Atlas, published pages.

## Before you finish

```sh
pnpm exec intentset validate
pnpm exec intentset architecture check     # when .intentset/architecture.yaml exists
pnpm exec intentset review --base main
```

Fix every error. Resolve each slice `review` lists under "Code changed, records unchanged", by updating its records
or with the trailer. The architecture check needs TypeScript 7; on an earlier TypeScript, run the toolchain as
`pnpm dlx --package=@intentset/cli --package=typescript@7 intentset ...`.

## Record format

A record is a Markset document: Markdown with YAML frontmatter under `intentset:` beside `markset: 0`, and its
level-one heading repeats its title. Plain Markdown is valid Markset. For the rest of Markset's syntax, the cards,
callouts, tables and other constructs a record may use and the codes `validate` reports for them, read Markset's
guide at https://markset.org/guide.md, or print it with `pnpm dlx @markset-lang/cli guide`.

An existing record of the same type in this repository is the best template; a new behavior looks like this, one
recognizable promise including how it fails:

```markdown
---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-AREA-NAME
  type: behavior
  title: The promise in a few words, such as Schedule a student assessment
  status: draft
  owner: <an owner from the registry>
  visibility: internal
  audiences: [engineering, product]
  parent: CAP-...
  links:
    governedBy: [RULE-...]
  availability:
    products: [PRD-...]
    releases: [<a release from the registry>]
    roles: [<a role>]
    editions: [<an edition>]
    flags: []
---

# The promise in a few words, such as Schedule a student assessment

## Behavior
Who acts, and what the system does.

## Preconditions
What must be true first.

## Outcomes
Success: what happens. Failure: what is rejected, and what is left unchanged.
```

A knowledge record explains behaviors, rules or capabilities to one audience, in that audience's words rather than
the behavior's. It may carry `tips`: one plain sentence per explained ID, at most 160 characters, which the
product shows beside the control that delivers that behavior once the knowledge is reviewed and published.

```yaml
  links:
    explains: [BEH-AREA-NAME, RULE-AREA-LIMIT]
  tips:
    BEH-AREA-NAME: What this control does, in one sentence.
    RULE-AREA-LIMIT: The limit, and what happens at it.
```

Above the behaviors sit the reasons for them. An intent says why the product is changing (its Rationale names the
problem or opportunity), an outcome says what observable change is expected, and a measure under the outcome says
how that change will be read: a metric, the baseline before the change or the literal `unknown`, a target, the
window in which it is read and the source the evidence comes from, which must be in the registry. An outcome past
draft needs at least one measure. Write a measure when you add an outcome, before the capabilities under it.

```yaml
  id: MEAS-AREA-NAME
  type: measure
  parent: OUT-...
  measure:
    metric: median_time_to_intervention
    baseline: 5 days
    target: under 2 days
    window: 90 days after <a release from the registry>
    source: <an evidence source from the registry>
    direction: decrease
```

Each type requires these level-two sections:

| Type | Required sections |
|---|---|
| product | ## Scope |
| intent | ## Rationale |
| outcome | ## Measure |
| measure | ## Method |
| capability | ## Overview |
| behavior | ## Behavior, ## Preconditions, ## Outcomes |
| rule | ## Constraint |
| scenario | ## Given, ## When, ## Then |
| slice | ## Responsibility, ## Public contract, ## Verification |
| contract | ## Interface, ## Compatibility |
| verification | ## Procedure, ## Expected result |
| knowledge | ## Guidance |
| decision | ## Context, ## Decision, ## Consequences |

The specifications are at [intentset.org/specifications](https://intentset.org/specifications/).
