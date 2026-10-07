---
markset: 0
---

{.eyebrow}
In practice

# The adoption log: Streamlane and Driftline.

{.lead}
Coral Reef Ventures is adopting Intentset in two of its own products: Streamlane, a work management product, and Driftline, which watches how a product is used. Neither is released. This log records what Intentset caught in them, what it cost and what it changed, newest first.

Both products' repositories are private, so this page counts and describes their records rather than linking to them. A number like Streamlane #352 is a pull request in that product's repository.

## Where it stands

Counts taken on 2026-10-06 on each product's main branch, from `intentset validate` and the architecture check (the 0.6 toolchain) and from the records' frontmatter.

### Streamlane

:::metrics
| Count | Value |
|---|---|
| Baselined architecture violations | 472 |
| Slices | 37 |
| Records | 86 |
| Records approved | 2 |
| Behaviors declared | 20 |
| Behaviors named in code | 4 |
:::

Validation reports 0 errors and 577 warnings at [L2](../how-it-works/index.html#adopt-in-levels). 472 are the violations in the architecture [baseline](../specifications/vsa/index.html#9-exceptions-and-adoption), which [migration mode](../specifications/vsa/index.html#9-exceptions-and-adoption) reports as warnings. Of the other 105, 64 are on draft slices that have no behaviors yet or have files in no known layer, and 41 are imports into a slice from code outside the checked scope. All but two records are drafts. Of the 20 behaviors, 4 are named in the backend's code and a fifth only as a marker in the web app. The other 15 belong to a second capability, modelled before its release, and are named nowhere yet. Five of the 20 have a verification record.

### Driftline

:::metrics
| Count | Value |
|---|---|
| Records | 32 |
| Records promoted | 6 |
| Slices | 6 |
| Slices with code | 1 |
| Validation errors | 0 |
:::

Validation reports 21 warnings at L2, all on drafts: five slices whose code is not written yet and that have no behaviors, and six outcomes with no measure record yet. Driftline reads usage evidence and writes none, so its two behaviors are covered by its tests, not named in its code.

## 2026-10-06: The gate goes on

Streamlane made its model a required check on every pull request (Streamlane #352). The check runs two commands, through `pnpm dlx`, so the product gains no dependency:

- `intentset validate --level L2 --mode migration`, against a baseline of the architecture violations that already existed, so only a new one fails.
- `intentset review --fail-on-drift`, which fails when a slice's code changed and its records did not, unless a commit says no behavior changed.

The pull request opened with 478 entries in the baseline: 452 for 226 imports past another slice's [entrypoint](../specifications/vsa/index.html#3-slice-metadata) (each reported twice, as VSA003 and TS006); 21 for imports that cross a [region](../specifications/vsa/index.html#5-internal-dependency-policy) the wrong way (REG001); 4 for imports of the backend's client library outside the one module meant to hold them (AMP002); and 1 for a dependency cycle (VSA005). A commit in the same pull request routed the blocked slice's web consumers through its entrypoint, which closed an item the first pilot had left open and retired 6 entries. The gate merged with 472. Streamlane's rule is to rewrite the baseline only when a change retires entries, never to absorb a new one.

The check on Streamlane's main branch now reports:

```text
86 artifacts, 0 errors, 577 warnings
Architecture (L2, migration mode): 37 active slices; 192 files claimed,
0 unclaimed, 596 out of scope (counted, not reported); 1025 import edges,
487 across slices; 1 cycle; 0 excepted, 472 baselined, 0 stale baseline entries
```

### What it cost

The gate's first failure came on its own pull request, on its second commit. The commit that rerouted the consumers changed code in two slices, the blocked state and the work views, and said so in a sentence: `Intentset-Unchanged: SLICE-WORK-BLOCKED's entrypoints and claims are as recorded; …`. Review reads that [trailer](../how-it-works/index.html#written-by-agents-reviewed-by-people), a `Key: value` line at the end of a commit message, as a list of slice IDs, so the sentence acknowledged neither slice:

```text
Code changed, records unchanged (2, 2 not acknowledged)
If behavior changed, update those records in this change. If it did not,
say so in a commit with the trailer `Intentset-Unchanged: <slice ID>`.
```

It listed the 21 records that describe the blocked state, the ones the first pilot said the next change would meet. A commit with one trailer per slice, `Intentset-Unchanged: SLICE-WORK-BLOCKED` and `Intentset-Unchanged: SLICE-WORK-VIEWS`, passed, and Streamlane's instructions to its agents now say one trailer per slice. Every run of the check since has passed, on main and on the next four pull requests (Streamlane #353, #355, #356 and #357), to 2026-10-06.

## 2026-10-04 to 2026-10-06: Driftline, modelled before its code

Driftline's model was written before any of its product code (Driftline #6, 2026-10-04): 26 records, all draft, each claim citing its source. They are one product, 4 intents, 6 outcomes, 8 capabilities, 6 slices and 1 decision. The model validated at L2 with 0 errors and 18 warnings, all expected of a model ahead of its code: each draft slice's entrypoint and claims pointed to paths not yet written (VSA002, VSA009), and no slice had behaviors yet (CORE009). Driftline added the check to its pull requests that evening (Driftline #8).

### What it cost

- **No place for a measure.** The 0.5 toolchain had no record type for a success measure, so each outcome carried its measure in a section. Measures became records in 0.6.0, released that evening (ADR 0012). Driftline's six outcomes have no measure records yet; that is six of its warnings today.
- **TypeScript 7.** The architecture check needs TypeScript 7 and Driftline is on 5.9, so the CLI is pinned in a package of its own.

### The first code, 2026-10-06

The first code, the package that reads usage evidence, was checked against the model in Driftline #20, which merged with 0 errors at L2 and no warnings on its slice.

Gary approved the first records the same afternoon (Driftline #21). The slice, its two behaviors and their two verification records became implemented, and the rule that evidence names no person became approved. The capability is still a draft.

## 2026-10-06: The loop closes at runtime

Streamlane's backend now says which behaviors a call delivers (Streamlane #351, ADR 0062). The code says it with one call, `exercised(context, "BEH-…")`, and each call writes one line of usage evidence to the backend's log:

```json
{"usage":"0.1","kind":"result","op":"<operation>","org":"<org id>","outcome":"invalid","behaviors":["BEH-BLOCKED-START-GUARD"],"rule":"RULE-BLOCKED-DEFINITION","ms":38}
```

A line carries the operation, an opaque organization id, the outcome, the behaviors, and the rule that refused the call, if one did. In ADR 0062's words, "It names no person: no user id, email, name, argument, message, item id or key." The format, usage evidence 0.1, is a draft written in Driftline under the MIT licence, meant to move into Intentset as an extension once it has proved itself.

Driftline's first capability reads it back (Driftline #20). It loads Streamlane's model with `@intentset/core`, scans Streamlane's source, not its tests, for behavior IDs, and counts the evidence for each behavior: attempts, successes, refusals by rule, failures and accounts. A behavior nothing names reads "no signal", never "unused". It answers from a command line and from an MCP server.

The read recorded on Driftline #20 covered one day of a shared test environment, where Streamlane's end-to-end tests made the calls. Each behavior's attempts came from 2 accounts, both test organizations. These are test calls, not use.

| Behavior | Attempts | Succeeded |
|---|---|---|
| BEH-BLOCKED-START-GUARD | 34 | 34 |
| BEH-BLOCKED-REASON | 14 | 14 |
| BEH-BLOCKED-BY-LINK | 11 | 11 |
| BEH-BLOCKER-CLOSES | 2 | 2 |
| BEH-BLOCKED-SHOWN | no evidence | n/a |

Of the 3,066 lines read, 61 named a behavior. The other 3,005, across 74 operations, named none: those operations are not mapped to behaviors yet.

### What it caught

- **The start guard was never refused.** The browser disables Start on a blocked item, so a refusal reaches the backend only from another client, such as an agent or the command line. Streamlane's tests cover the refusal.
- **One behavior lives only in the browser.** The blocked state's display is named only in a marker in the web app, so it has no backend evidence. The report says where it is named rather than calling it unused.
- **Two changes came from the first run.** A behavior with no evidence now names where it is named, and the operations that name no behavior are cut to the busiest ten with the rest counted, so nothing is dropped silently.

ADR 0062 names the second capability's 15 behaviors as the natural next ones to name in code.

## 2026-10-04: The model widens across Streamlane

Streamlane moved its web app into feature folders, by area and slice, without changing behavior (Streamlane #321, ADR 0058): 179 files into 35 feature folders and 4 shared ones. The architecture check's scope was set to match.

Validation went from 0 errors to 140: 134 files that no slice claimed, and 6 for 3 imports past the blocked slice's entrypoint. Half an hour later Streamlane drafted a slice record for each of the 34 folders that had none (Streamlane #324). Each draft claims its folder, lists the dependencies observed, and names the most-imported file as its entrypoint, for the owner to confirm or change. Unclaimed files fell to 0 and errors rose to 473: 448 for 224 imports past another slice's entrypoint, 20 for region crossings, 4 for imports of the backend's client library and 1 for a cycle. In Streamlane #324's words, "declaring every slice lets the checker see the boundaries between them, and the web app does not respect them yet." With one slice declared, the check had seen only the imports into the blocked slice, and none of the shared code composing slices.

Slices went from 1 to 37 and records from 26 to 86 between 2026-10-04 and 2026-10-06.

### What it cost

- **A miscount.** The ADR first said 268 unclaimed files, because `grep -c` also counted each error's `fix:` line. Streamlane #324 corrected it to 134.
- **A false positive.** Three warnings were the checker's mistake (TS004): a `/` in JSX text read as an unterminated regular expression.
- **An open question.** Shared code that composes slices crosses a region the wrong way, 21 times today, and ADR 0058 has not decided what to do about it. The 21 are in the baseline.

### What it changed in Intentset

The import extractor now reads JSX as JSX. The fix shipped in 0.6.0 that evening, and Streamlane moved to it the same night.

## 2026-10-04: Help from the model

Streamlane put four tips on its blocked-work knowledge record and bound them to the controls that deliver each behavior (Streamlane #314). `intentset publish` writes `help.json`, and the web app puts each tip, with `@intentset/help`, on every element marked `data-behavior="BEH-…"`.

### What it cost

The record was a draft, and publication denies by default, so `help.json` came out with no tips. Gary approved the record for publication before the change merged (Streamlane #315) and pinned it to 5 behaviors and 3 rules, so a change to any of them marks it for review again. It was the first Streamlane record a person approved through Intentset. Today the file carries the four tips. BEH-BLOCKER-CLOSES has none, because no control delivers it: it happens when the blocker closes.

### What it changed in Intentset

Tips on knowledge records, `help.json` and `@intentset/help` were released in 0.5.0 at noon that day (ADR 0011). The ADR was written from the pilot's knowledge record, which then explained four behaviors in three paragraphs: a panel, not a hover.

## 2026-10-02: The first pilot, one capability modelled

An agent modelled one capability of Streamlane, its blocked state, from what the repository already held (Streamlane ADR 0057). The product owner had not reviewed it. The pilot was measured on a branch on 2026-10-02 and reached Streamlane's main branch on 2026-10-04 (Streamlane #305), with the same result.

### What was modelled

In Streamlane, a task or bug is blocked when another open item blocks it or someone gives a reason, and every screen, the start guard and the backend must agree on that answer. The capability spanned three packages, had tests at three levels, and had a decision record explaining its design. From those, the agent wrote:

:::metrics
| Records | Count |
|---|---|
| Behaviors | 5 |
| Rules | 3 |
| Scenarios | 2 |
| Tests bound | 8 |
| Records | 26 |
:::

Each of the eight verification records names a test that already existed. The agent also wrote the slice that owns the code and the contract it exposes, and the existing decision record joined the model by gaining frontmatter, its text unchanged. Every record the agent wrote started as a draft; the decision record, already accepted, joined as approved.

### What it found

The model validated, and its slice passed the architecture check. Reading it showed what no one had listed:

- **Two of the three rules had no test:** that the blocked state changes in the same transaction as its cause, and that a blocker hidden from the reader is counted but never named.
- **Three behaviors were checked only in the browser,** by end-to-end tests that need a deployed environment, so their evidence reads as missing until those run.
- **Five of the eight checks passed** on the commit the records describe: the core unit tests, and the backend tests against a local database.

None of this was new to the code. It was new to the people reading it.

### What it changed in Intentset

The pilot asked four questions the specifications had not answered, and each was decided:

1. **A slice can span packages.** The blocked state's logic lived in a shared package and its interface in the web app, so a slice now has one entrypoint per package it spans.
2. **Reaching past a slice's entrypoint is reported even from outside the checked scope,** as a warning, so a narrow scope no longer hides it.
3. **Test results stay outside the commit they assess,** because a commit cannot describe its own results.
4. **A draft rule with no test is a warning,** so the gap shows before it becomes an error.

It also exposed defects in the reference implementation, which were fixed before release.

### What came after

Tried against the 0.4 toolchain, a one-line change to the slice's code was listed for review with the 21 records that describe it, which is what the next change to the blocked state would meet. It did, on 2026-10-06, when the gate went on.

[[Start with one capability](../start/index.html)]{.button .primary} [[See how it works](../how-it-works/index.html)]{.button}
