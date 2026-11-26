---
markset: 0
---

{.eyebrow}
Reference

# Glossary

{.lead}
For anyone meeting Intentset's words for the first time: one plain definition each. Where a word names a type of record, [the Core specification](../specifications/core/) has its exact meaning.

## Ten words carry most of the meaning

### Intent

What the product should do and why, written before the code. An intent record says why the product should exist or change.

### Record

One file of the model: Markdown, with YAML frontmatter under `intentset:` that the tools read, and text below it that people read. Each record has an ID, such as `RULE-ASMT-FUTURE`, and a type.

### Model

All of a product's records together. It is a set of files in the repository, not an AI model.

### Behavior

One promise the product makes, including how it fails, such as "Schedule a student assessment".

### Rule

What must stay true, written once, however many behaviors it governs.

### Check

The plain word for a verification record: how a promise is checked, by naming an automated test or a manual review procedure. A check that is linked is not a check that passed.

### Evidence

Run records, each one check's result at one commit. A pass counts while what it checked is unchanged, and a gate may ask for a pass on the commit under review. Reports show two numbers apart: how many promises have a check linked, and how many have a current pass.

### Approve

A person moves a record out of draft. Agents draft; agents never approve. `intentset approve <ID> --by <person>` writes the approval into the record, and the pull request shows it as a change like any other.

### Drift

Code changed and its records did not. `intentset review --fail-on-drift` fails CI on it, unless a commit says that no behavior changed.

## The other terms, in alphabetical order

### Atlas

The review pages `intentset serve` builds from the model: every record with its text and links, owners, verification status and publication readiness, at http://127.0.0.1:3000/ or written to a directory with `--out`. [Lantern's](../example/atlas/map/) is published on this site.

### Baseline

The architecture violations already in the code when the check is switched on, written to a file so that only a new one fails a change. A baseline may shrink and may not grow. A measure's baseline is something else: its starting reading.

### Current pass

A pass whose binding still holds: by default, what its check is about is unchanged since it ran, from the behavior and the code that delivers it to the test and what it imports. A stale pass, and a skipped, errored or missing run, never counts.

### Delivery

Whether the work a record describes exists, apart from its approval: `planned` when it does not exist yet, `built` when the code exists.

### Export

The model as one versioned JSON file, written by `intentset graph`, for other tools to read. Restricted records are left out unless an operator includes them, and every omission is counted.

### Knowledge

A record that explains part of the product to one audience, such as teachers. It is reviewed against the records it explains and held for review when one of them changes. `intentset publish` releases what one audience may see for one release.

### Level

How much of the specifications a model meets, each level including the ones before it: L1 the records are well formed, L2 the code respects each slice's ownership, L3 each claim has a current pass, L4 what is published is reviewed and authorized. `intentset validate --level` checks up to L4. L5 is about how those checks run: they are required in CI, so no change merges without passing them, with an impact report on every pull request and a snapshot of the model at each release.

### Profile

Two senses. A record's profile, such as `intentset/rule/0.2` in its frontmatter, says what that type of record must contain. A reference profile maps the slice rules onto one stack: the specifications include one for TypeScript and AWS Amplify Gen 2.

### Run record

One run of one check: which check, at which commit and graph, in which environment, with which result (pass, fail, skip or error). `intentset evidence import` writes them from Vitest, Playwright and node:test (TAP reporter) reports.

### Scenario

A record that walks through concrete conditions, an action and the expected result, as an example of a promise. It is an example, not proof that every case works.

### Slice

The part of the code accountable for a set of behaviors, end to end. Each behavior past draft has exactly one, and the architecture check keeps other code out of a slice's private files.

### Snapshot

The commit and graph hash a report or a publication was made from, so that every count says what it counted.

### Tip

One sentence a knowledge record carries for one behavior or rule, for the product to show beside the control that delivers the behavior or enforces the rule. Tips are reviewed and published with the record.

### Trailer

A `Key: value` line at the end of a commit message. `Intentset-Unchanged: SLICE-…` says that no behavior of that slice changed, which answers drift.

### Verification

The type of record behind a check. It says how a claim is checked, automated or manual, and where: a test's file and a stable selector, or a review procedure. A verification is a definition, not evidence.

[[See the words at work in the shop's model](../example/)]{.button .primary} [[How it works](../how-it-works/)]{.button}
