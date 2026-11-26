---
markset: 0
---

{.eyebrow}
How it works

# How Intentset works

{.lead}
Intentset keeps what your product promises in short files beside the code, and checks every change against them. This page follows one example through: an online shop whose password reset links must expire after an hour.

## The records

Each promise is a record: one Markdown file under `product/`, reviewed in the same pull request as the code. This is the shop's rule, the whole file:

```markdown
---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/rule/0.2
  id: RULE-RESET-LINK-EXPIRY
  type: rule
  title: Reset links expire after one hour
  status: draft
  owner: team-accounts
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
---

# Reset links expire after one hour

## Constraint

A password reset link stops working one hour after it is sent.
```

Your agent writes the header between the `---` lines, which tools read. You read the part below it.

Most of the work is two kinds of record:

- A **behavior** is one thing the product does, including how it fails: *reset a forgotten password*.
- A **rule** is something that must stay true, written once even when many behaviors keep it: *a reset link stops working after an hour*.

A third kind, the **slice**, names the code that delivers a set of behaviors, so Intentset knows which promises a change to that code can affect. There are others for when you need them, such as checks, decisions and help articles; [the glossary](../glossary/) lists them all. Together, a product's records are its model: a set of files, not an AI model.

## Agents write them, people approve them

The coding agent that changes the code updates the records in the same commit. `intentset init` writes a guide for your agents to `.intentset/agents.md`, and one line in CLAUDE.md or AGENTS.md points them at it. Before changing a file, an agent runs `intentset context <file>` to load what that code promises.

Only a person approves a record. `intentset approve <ID> --by <person>` marks it approved and names who approved it and when. It commits nothing, so the approval is a change the pull request's reviewer reads like any other.

## What CI checks

CI runs two commands on every pull request:

```sh
npx intentset validate --level L2
npx intentset review --base origin/main --fail-on-drift
```

The first checks that the records are complete and link up, and that each slice's code stays out of other slices' internals. The second compares the branch with main and fails on drift: code that changed while the records that describe it did not.

Say customers report that their reset link has already expired by the time they click it. The agent asked to fix it raises the limit to 24 hours, so that links don't run out before people get to them, and updates the test that expected one hour. The tests pass, and the review fails with this:

```text
## Code changed, records unchanged (1, 1 not acknowledged)

Slices whose code changed while none of the records that describe them did: the slice, its behaviors, their rules, scenarios and verifications, its contracts and their decisions. If behavior changed, update those records in this change. If it did not, say so in a commit with the trailer `Intentset-Unchanged: <slice ID>`.

### SLICE-ACCOUNT-RESET: Password reset

- Not acknowledged: update the records below, or say in a commit that no behavior changed.
- Code changed: src/features/accounts/reset/policies/link-expiry.test.ts
- Code changed: src/features/accounts/reset/policies/link-expiry.ts
- Records describing it, none changed: BEH-RESET-PASSWORD, RULE-RESET-LINK-EXPIRY, SLICE-ACCOUNT-RESET
```

{.small .muted}
Real output of `intentset review --base origin/main --fail-on-drift`, run on the shop's records and code in a scratch repository. The report's other sections are left out.

There are two ways through, and both make the same command pass:

- **The behavior changed.** The agent updates the rule in the same pull request, and the reviewer reads one line before the code:

  ```diff
  -A password reset link stops working one hour after it is sent.
  +A password reset link stops working 24 hours after it is sent.
  ```
- **It did not**, as in a refactor. The commit message ends with `Intentset-Unchanged: SLICE-ACCOUNT-RESET`, where a reviewer can read the claim and question it.

An agent can edit a record as easily as a test, and Intentset lets it. The difference is where the edit shows up: a changed rule is one sentence the reviewer reads first, not one number in a long diff.

## What else it can check

You can add these as you need them:

- **Tests that pass now.** A check record names the test that holds a promise. `intentset evidence import` reads your Vitest, Playwright or node:test results from CI, and a pass counts while what it checked is unchanged. `intentset evidence stale` lists the checks with no current pass.
- **Boundaries in the code.** Each behavior has one slice, and `intentset architecture check` fails an import that reaches into another slice's private files. Violations already in the code are written down once, so only new ones fail.
- **Help that stays true.** A help article written as a record is held for review when a rule it explains changes, so it is not published out of date.

## Next to what you have

Intentset replaces none of these. It ties them to what the product promises:

- **Tests** check the code, and an agent can change them in the same commit as the code. A record says what the test is meant to hold.
- **Pull request summaries** are written from the diff. `intentset review` starts from what the records say changed.
- **CLAUDE.md and AGENTS.md** say how to work in the repository, not what the product promises.
- **Decision records and docs** each hold part of the picture, and go out of date without anyone noticing.

It does not prove the product correct: a passing test can still assert the wrong thing. It does not run your code, call the network or edit your files when it checks them.

{#cost}
## What it costs

- **One feature.** An agent writes it down from your code and tests, and you review about eight files. On a fresh TypeScript repository with one feature and three tests, [Try it on your code](../start/) takes five minutes.
- **Every change.** The agent updates the records in the same commit, or adds one line to the commit message saying no behavior changed. In Coral Reef Ventures' own use, the check ran 367 times from 2026-10-07 to 2026-10-10 and passed 355 times without anyone noticing it. Nine of the failures were drift, and each passed once a commit added that one line.
- **A whole product.** Writing down a product that already exists takes time. [Model the whole product](../adopt/) is how one person running many agents does it.

## Adopt in levels

Start at the first level and stop wherever the value runs out.

| Level | What it adds |
|---|---|
| L1 | Records that are complete and link up |
| L2 | Each behavior owned by one slice, and the boundaries in the code checked |
| L3 | A current passing test for each promise |
| L4 | Help that is held for review when what it explains changes |
| L5 | All of it on every pull request |

`intentset validate --level L3` runs every check up to that level.

[[Try it on your code](../start/)]{.button .primary} [[Every term, defined](../glossary/)]{.button}
