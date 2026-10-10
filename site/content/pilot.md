---
markset: 0
---

{.eyebrow}
In practice

# The adoption log: Streamlane and Driftline

{.lead}
Coral Reef Ventures is adopting Intentset in two of its own products: Streamlane, a work management product, and Driftline, which watches how a product is used. Neither is released. This log records what Intentset caught in them, what it cost and what it changed, newest first.

Both products' repositories are private, so this page counts and describes their records rather than linking to them. A number like Streamlane #352 is a pull request in that product's repository.

## Where it stands

Counts taken on 2026-10-10 on each product's main branch, from `intentset validate` and the architecture check (the 0.6 toolchain) and from the records' frontmatter.

### Streamlane

:::metrics
| Count | Value |
|---|---|
| Baselined architecture violations | 469 |
| Slices | 39 |
| Records | 89 |
| Records approved | 4 |
| Behaviors declared | 21 |
| Behaviors named in code | 8 |
:::

Validation reports 0 errors and 603 warnings at [L2](../how-it-works/index.html#adopt-in-levels). 469 are the violations in the architecture [baseline](../specifications/vsa/index.html#9-exceptions-and-adoption), which [migration mode](../specifications/vsa/index.html#9-exceptions-and-adoption) reports as warnings. Of the other 134, 64 are on draft slices that have no behaviors yet or have files in no known layer, 66 are imports into a slice from code outside the checked scope, and 4 are slices a resource lists as consumers that do not list the resource back. All but four records are drafts. Of the 21 behaviors, 8 are named in the backend's code and a ninth only as a marker in the web app. The other 12 belong to the second capability, which is partly built: four of them are deferred to a later release. Five of the 21 have a verification record.

### Driftline

:::metrics
| Count | Value |
|---|---|
| Records | 33 |
| Records promoted | 6 |
| Slices | 6 |
| Slices with code | 1 |
| Validation errors | 0 |
:::

Validation reports 21 warnings at L2, all on drafts: five slices whose code is not written yet and that have no behaviors, and six outcomes with no measure record yet. Driftline reads usage evidence and writes none, so its two behaviors are covered by its tests, not named in its code.

## 2026-10-07 to 2026-10-10: Each area becomes a backend

Streamlane declared its areas (Streamlane #374), and the [AMP rules](../specifications/profile-typescript-amplify-gen2/index.html#9-areas-more-than-one-backend) began to bind. Until then, in that pull request's words, "AMP007 to AMP011 were evaluated against nothing." The declaration names the areas that already had a backend, platform and search, with each one's backend, schema and frontend, plus the shared backend package and the one schema bridge. AMP008 to AMP011 came back clean: no import between backends, no name declared by two schemas, no reference across an area, one client. AMP012 and AMP013 stay review assertions, because the checker cannot decide them from source.

The declaration also surfaced 30 slices that belong to delivery, docs and work, three areas that had no backend yet. Streamlane kept their true domains and baselined the 30 findings (AMP007), rather than relabelling the slices as platform. The baseline then shrank as each area got its own backend:

| Date | Change | Baseline |
|---|---|---|
| 2026-10-06 | The gate goes on (Streamlane #352) | 472 |
| 2026-10-07 | Areas declared; 30 slices of areas with no backend yet (#374) | 502 |
| 2026-10-08 | Delivery becomes a backend (#405) | 498 |
| 2026-10-09 | Docs becomes a backend (#415) | 492 |
| 2026-10-10 | Work becomes a backend; no AMP007 entries left (#489) | 472 |
| 2026-10-10 | A second shared backend package declared; one stale entry retired (#503) | 471 |
| 2026-10-10 | A feature change routes one import through an entrypoint (#505) | 469 |

Each new backend is a declared area with a resource record, such as RES-WORK-BACKEND, that the slices using it list. The check on Streamlane's main branch now reports:

```text
89 artifacts, 0 errors, 603 warnings
Architecture (L2, migration mode): 39 active slices; 233 files claimed,
0 unclaimed, 738 out of scope (counted, not reported); 1176 import edges,
495 across slices; 1 cycle; 0 excepted, 469 baselined, 0 stale baseline entries
```

### What it cost

- **A resource listed one way.** The delivery cut added RES-DELIVERY-BACKEND naming four consumers, but none of the four slice records was changed to list it. The validator reports each as a warning (VSA009), and all four are still open on main. The docs and work cuts updated their slices in the same change.
- **Findings declared, not baselined.** Declaring the areas surfaced 72 findings, not 30. The other 42 were the search backend and the shared package reading as owned by nobody. A resource record for one and a shared region for the other declared them away.

## 2026-10-07 to 2026-10-10: The drift gate in daily use

From 2026-10-07 to 2026-10-10 the model check ran 367 times on Streamlane's pull requests, and 355 runs passed. Nine of the 12 failures were the drift gate's: a commit changed a slice's code with no `Intentset-Unchanged` trailer at all. They came from 8 pull requests, one of which changed seven slices at once:

```text
Code changed, records unchanged (7, 7 not acknowledged)
```

Each passed after a commit with one trailer per slice; that one carried seven. Two failures were the help check described in the next entry, and the rest failed before the check ran.

### What it cost

Driftline's gate failed twice on one pull request (Driftline #25) with the trailer present. The fix commit says why: "The previous empty commit put Intentset-Unchanged in its own paragraph above the Co-Authored-By line, so git's trailer parser, which reads only the last block, never saw it." It passed with `Intentset-Unchanged: SLICE-BACKEND-SIGNALS` in the last paragraph.

### What it changed in Intentset

The agent guide now says the trailer goes in the commit message's last paragraph, and `init --agents` and `guide` write that sentence (Intentset #39, 2026-10-10, not yet released).

## 2026-10-08 to 2026-10-10: The second capability's help, checked in CI

Streamlane's second capability got its decision approved and its help published. The decision record, ADR-0061, was approved and rewritten to the first release's scope (Streamlane #407). Four of its behaviors moved to later releases, and three new release labels in the registry keep them out of the help: publishing for the first release leaves deferred behavior out, so help never describes work that does not exist. The next day four of its behaviors were named in code, from BEH-DEPMAP-START to BEH-DEPMAP-LIMITS (Streamlane #418). Its knowledge record, KB-DEPENDENCY-MAP, was approved by the product owner after its text was corrected to describe only what the release has (Streamlane #440). That makes four approved records.

### What it caught

Streamlane #418 edited BEH-BLOCKED-SHOWN, one of the behaviors KB-BLOCKED-WORK is pinned to. That put the knowledge record back up for review, as pinning means to. Nobody noticed until the next publish, which wrote 0 documents and deleted the committed help for blocked work. The record was reviewed again, and Streamlane #440 added a CI step that runs the publish and fails when its output differs from what is committed. Tested against a planted change, one appended line on a behavior dropped the document and failed the step. Three later changes each re-pinned KB-DEPENDENCY-MAP so it would not drop out of the publish silently.

### What it cost

- **A check that could not pass.** The first version compared the publish's output with a plain diff. Every publish writes a new commit and graph hash into its snapshot, so the check failed on its own pull request, twice, until it compared everything but those two fields.
- **A refusal with no reason given.** The publisher refused a knowledge record whose body restated its title, with the reason `title` "and no further explanation; I bisected it paragraph by paragraph."
- **An exact heading.** The validator requires a section named exactly `Decision`, so ADR-0061 says which release it decides in that section's first line, not in its heading.

None of the three has changed in Intentset yet.

## 2026-10-08: Driftline decides what a drafted model is worth

Driftline recorded how much of the product works when a team has no Intentset model (Driftline #27). The decision record, ADR-NO-MODEL, is linked from SLICE-ADOPTION-LADDERS by `informedBy`: a model is required and Intentset is not, because Driftline drafts one. Its value is a gradient, not a switch, and a draft stays labelled until a person accepts it. The record is a draft. Validation reports 33 artifacts, 0 errors and the same 21 warnings.

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
