---
markset: 0
---

{.eyebrow}
In practice

# The adoption log: Streamlane and Driftline

{.lead}
Coral Reef Ventures is adopting Intentset in two of its own products: Streamlane, a work management product, and Driftline, which watches how a product is used. Neither is released. This log records what Intentset did for them, what it cost and what it changed in Intentset, newest first.

Each entry says what happened, what it achieved, what it cost, and what changed in Intentset as a result. A word with a dotted underline has a short explanation: hover over it, or tap it. For anything else, use **Ask the docs**, the button at the bottom right of the page. It answers from this site's documentation and links to its sources.

Both products' repositories are private, so this page counts and describes their records rather than linking to them. A number like Streamlane #352 is a pull request in that product's repository.

## Where it stands

Counted on 2026-10-10 on each product's main branch, with Intentset's own checks (the 0.6 release) and from the records themselves. Streamlane's architecture figures and record count were taken again on 2026-10-11, after the entry below; the rows on approvals and behaviors are from 2026-10-10.

### Streamlane

:::metrics
| Count | Value |
|---|---|
| [Baselined architecture violations]{.term tip="Structural problems that already existed when the check was switched on. They are tolerated, so only a new one fails a change. This number should only go down."} | 0 |
| [Slices]{.term tip="A slice is one feature of the product: the code that builds it and the records that describe it."} | 43 |
| [Records]{.term tip="A record is a short Markdown file stating one thing about the product, such as a behavior, a rule or a decision. Intentset checks records against each other and against the code."} | 98 |
| [Records approved]{.term tip="Records a person has reviewed and accepted. The rest are drafts: checked, but held to looser rules until someone approves them."} | 4 |
| [Behaviors declared]{.term tip="A behavior is one thing the product does that a person could observe, such as refusing to start blocked work."} | 21 |
| [Behaviors named in code]{.term tip="Behaviors whose code says, in one line, which behavior it delivers. That is what lets a log line or a test be traced back to its record."} | 8 |
:::

Streamlane's check reports 0 errors and 92 warnings, in strict mode with no baseline. Errors fail a change; warnings are only reported. The warnings are:

- 46 on draft slices that have no behaviors yet.
- 29 files the check cannot place in one layer, so their imports are not layer-checked.
- 15 imports, from the app's route pages, of a slice's private file instead of its entrypoint. The pages lie outside the declared scope, so they are reported and do not fail.
- 2 slices that do not list a backend that lists them.

Of the 98 records, all but a handful are drafts. The behaviors are as counted on 2026-10-10: 21, of which 8 are named in the backend's code and one more in the web app, with five that have a [verification record]{.term tip="A record that names the test proving a behavior works."}.

The number to watch was the baseline. It could only go down, and it did: from 472 when the check was switched on to 0 on 2026-10-11, while Streamlane grew from 37 slices to 43. Nothing is tolerated now.

### Driftline

:::metrics
| Count | Value |
|---|---|
| Records | 33 |
| [Records promoted]{.term tip="Records a person has moved past draft: approved, or marked as built."} | 6 |
| Slices | 6 |
| Slices with code | 1 |
| Validation errors | 0 |
:::

Driftline's check reports 21 warnings, all on drafts: five slices whose code is not written yet and that have no behaviors, and six [outcomes]{.term tip="An outcome is a result the product is meant to bring about for the people using it."} with no [measure]{.term tip="A record saying how an outcome is measured."} yet. Driftline reads usage evidence and writes none, so its two behaviors are proved by its tests rather than named in its code.

## 2026-10-10 to 2026-10-11: The baseline reaches zero

By 2026-10-10 the baseline held 469 violations. Streamlane wrote a plan to retire it (#533) and followed it in steps, each its own pull request with the gate on. The imports that reached past a slice's entrypoint became imports through it, so every slice's entrypoint is a plain list of what other slices may use. Pieces several slices shared moved out into shared code, and the app's shell became [composition]{.term tip="Code above the slices that wires them together. It may use each slice only through its entrypoint, and no slice may import it."}. The plan's first step took the baseline to one entry, the dependency cycle.

That cycle was the hard part. 25 of the product's 39 slices formed one loop, joined by 99 imports, each reaching every other. It took four more changes (#575, #583, #587 and #596), after a plan for it (#563). The list pages opened the item page, and the item page opened the lists, so the item page became a slice of its own and the lists now reach it through a slot the app's root fills. The same was done for the docs editor and the live views embedded in a doc: the editor is given them instead of importing them. Each change replaced the one baseline entry with a smaller cycle: 25 slices became 22, then two cycles of 13 and 2, then one of 12, then none.

```text
98 artifacts, 0 errors, 92 warnings
Architecture (L2, strict mode): 43 active slices; 258 files claimed,
0 unclaimed, 783 out of scope (counted, not reported); 1196 import edges,
333 across slices; 0 cycles; 0 excepted, 0 baselined, 0 stale baseline entries
```

The baseline file is deleted, and the model gate runs in strict mode.

### What it achieved

- **No known violation is left to tolerate.** A change that adds any structural violation, including a new dependency loop, fails before it merges. The rule "the baseline only shrinks" is replaced by there being no baseline.
- **Slices can be changed one at a time.** With the loop gone, a slice's records can be promoted past draft without a cycle in its dependency graph.
- **The ending was measurable at every step.** The loop's size, 25 slices, 22, 13, 12, 0, was reported by the check after each change.

### What it cost

- **A cycle's baseline entry is rewritten each time it shrinks.** Each smaller cycle needed a new entry, and a rule of its own ("only replaced by a smaller cycle") for the baseline to still only shrink.
- **The check cannot see load order.** The last change passed every Intentset check and then failed 12 of the product's browser tests: the registration that gives the editor its blocks ran from a file the server never loaded on the client. Intentset reports who imports whom, not when a module runs. The fix rendered the registration from the app's root.
- **Seams that cost a faster test run.** Because the root now wires in the item page and the editor's blocks, a change to almost any web code reaches almost everything, so the product runs its full browser suite for most changes.
- **Records stayed drafts.** Retiring the cycle added slice records and changed others; each is still a draft until someone approves it.

### What changed in Intentset

Nothing yet. Whether a cycle's baseline entry should survive the cycle shrinking is a candidate for the next release.

## 2026-10-07 to 2026-10-10: Each area becomes a backend

Streamlane is splitting its backend into [areas]{.term tip="An area is a part of the product with a backend of its own: its own data, functions and deploys."}, and on 2026-10-07 it declared them to Intentset (Streamlane #374). That switched on the [AMP rules]{.term tip="The checks in Intentset's profile for TypeScript apps built on AWS Amplify. They cover how separate backends fit together."}, which check how separate backends fit together. In that pull request's words, until then "AMP007 to AMP011 were evaluated against nothing." The first run came back clean on four of them: no backend imports another's code, no name is declared by two backends, no code reaches into another area, and the app talks to all of them through one client. Two more rules stay manual review, because they depend on deployment settings the checker cannot read from source.

Declaring the areas also flagged 30 slices that belonged to areas with no backend yet: delivery, docs and work. Streamlane kept those slices in their real areas and added the 30 findings to the [baseline]{.term tip="The list of violations that existed when a rule started applying. They are tolerated; any new one fails."}, rather than pretend they belonged elsewhere. The baseline then shrank as each area got its own backend:

| Date | Change | Baseline |
|---|---|---|
| 2026-10-06 | The check is switched on (Streamlane #352) | 472 |
| 2026-10-07 | Areas declared; 30 slices in areas with no backend yet (#374) | 502 |
| 2026-10-08 | Delivery gets its own backend (#405) | 498 |
| 2026-10-09 | Docs gets its own backend (#415) | 492 |
| 2026-10-10 | Work gets its own backend; none of the 30 left (#489) | 472 |
| 2026-10-10 | A second shared backend package declared; one old entry gone (#503) | 471 |
| 2026-10-10 | A feature change fixes one import on the way (#505) | 469 |

Each new backend is declared with a [resource record]{.term tip="A record for something slices use at runtime, such as a backend. It lists the slices that use it, and each of those slices lists it back."}, such as RES-WORK-BACKEND, that the slices using it list. The check on Streamlane's main branch now reports:

```text
89 artifacts, 0 errors, 603 warnings
Architecture (L2, migration mode): 39 active slices; 233 files claimed,
0 unclaimed, 738 out of scope (counted, not reported); 1176 import edges,
495 across slices; 1 cycle; 0 excepted, 469 baselined, 0 stale baseline entries
```

### What it achieved

- **The boundaries between backends are enforced, not hoped for.** Any change that makes one backend import another, declares a name twice, or reaches across an area now fails before it merges.
- **The split had a measurable finish line.** Each area's findings disappeared from the baseline when its backend was declared, so "is this area done?" had a number for an answer. When work's backend landed, none of the 30 was left.
- **The baseline ended lower than it started,** 469 against 472, though declaring the areas first added 30.

### What it cost

- **A link made one way only.** The delivery backend's record named its four slices, but none of the four slices was changed to name it back. The check reports each as a warning, and all four are still open. The docs and work changes updated both sides.
- **Findings to sort.** Declaring the areas raised 72 findings, not 30. The other 42 came from two pieces of code that read as owned by nobody: the search backend and the package every backend shares. Declaring a resource record for one and a shared region for the other settled them, so they never entered the baseline.

## 2026-10-07 to 2026-10-10: The drift gate in daily use

The [drift gate]{.term tip="A check on every change. If a slice's code changed but its records did not, the change fails, unless a commit says that no behavior changed."} asks one question of every change: if a slice's code changed, did its records change too, or does the change say why not? From 2026-10-07 to 2026-10-10 the check ran 367 times on Streamlane's pull requests, and 355 runs passed. Nine of the 12 failures were the drift gate's: a commit changed a slice's code and said nothing about it. They came from 8 pull requests, one of which changed seven slices at once:

```text
Code changed, records unchanged (7, 7 not acknowledged)
```

Each passed once a commit added one [trailer]{.term tip="A Key: value line at the end of a commit message. Intentset reads Intentset-Unchanged: followed by a slice's ID as a statement that no behavior of that slice changed."} per slice; that one carried seven. Two failures were the help check described in the next entry, and the rest failed before the check ran.

### What it achieved

- **No code change merges unexplained.** Every merged change to a slice's code since the gate went on either updated its records or said, slice by slice, that behavior did not change. Nine times in four days, the gate stopped a change until someone said so.
- **The cost of the question is small.** 355 of 367 runs passed without anyone noticing the gate was there.

### What it cost

Driftline's gate failed twice on one pull request (Driftline #25) with the trailer present. The fix commit says why: "The previous empty commit put Intentset-Unchanged in its own paragraph above the Co-Authored-By line, so git's trailer parser, which reads only the last block, never saw it." It passed once `Intentset-Unchanged: SLICE-BACKEND-SIGNALS` moved into the last paragraph.

### What it changed in Intentset

The agent guide now says the trailer goes in the commit message's last paragraph, and `init --agents` and `guide` write that sentence (Intentset #39, 2026-10-10, not yet released).

## 2026-10-08 to 2026-10-10: The second capability's help, checked in CI

Streamlane's second [capability]{.term tip="Something the product lets people do, made of several behaviors."} got its decision approved and its help published. Its [decision record]{.term tip="A short document recording a decision and the reasons for it. An ADR."}, ADR-0061, was approved and rewritten to cover only the first release (Streamlane #407). Four of its behaviors moved to later releases, and three new release labels keep them out of the help, so the help never describes something that does not exist yet. The next day four of its behaviors were named in code, from BEH-DEPMAP-START to BEH-DEPMAP-LIMITS (Streamlane #418). The product owner approved its [knowledge record]{.term tip="A record written for people rather than for checks: an explanation that can be published as help in the product."}, KB-DEPENDENCY-MAP, after its text was corrected to describe only what the release has (Streamlane #440).

### What it achieved

- **Help cannot vanish without anyone noticing.** A change to a behavior had silently taken blocked work's help off the product (below). Streamlane now publishes the help on every pull request and fails the change if the result differs from what is committed. Tested by appending one line to a behavior, the check failed as it should.
- **Help describes only what is released.** The release labels keep the four later behaviors out of it.
- **Four more behaviors can be counted in use,** now that their code names them, and two more records are approved, ADR-0061 and KB-DEPENDENCY-MAP.

### How the gap showed

Streamlane #418 edited BEH-BLOCKED-SHOWN, one of the behaviors that KB-BLOCKED-WORK is [pinned]{.term tip="A knowledge record lists the behaviors and rules it explains. If any of them changes, the record goes back for review before it is published again."} to. That sent the knowledge record back for review, as pinning is meant to. But nobody noticed until the next publish, which wrote 0 documents and deleted the committed help for blocked work. The record was reviewed again, and the check above was added. Three later changes each re-pinned KB-DEPENDENCY-MAP so it would not drop out silently.

### What it cost

- **A check that could not pass.** The first version compared the publish's output with a plain diff. Every publish records a new commit and fingerprint, so the check failed on its own pull request, twice, until it ignored those two fields.
- **A refusal with no reason given.** The publisher refused a knowledge record whose text repeated its title, giving only the reason `title`, "and no further explanation; I bisected it paragraph by paragraph."
- **An exact heading.** The validator requires a section named exactly `Decision`, so ADR-0061 says which release it decides in that section's first line, not in its heading.

None of the three has changed in Intentset yet.

## 2026-10-08: Driftline decides what a drafted model is worth

Driftline recorded how much of the product works for a team that has no Intentset model (Driftline #27). The decision record, ADR-NO-MODEL, says a model is required but Intentset is not, because Driftline drafts a model itself. The value is a gradient, not a switch, and a drafted model stays labelled as a draft until a person accepts it. The record is still a draft. Driftline's check reports 33 artifacts, 0 errors and the same 21 warnings.

### What it achieved

The decision is linked to the slice it shapes, SLICE-ADOPTION-LADDERS, so it counts as one of that slice's records: when the slice's code changes, updating the decision satisfies the drift gate, and the gate knows where to look. What Driftline's site says about working without Intentset now sits next to the code that has to deliver it.

## 2026-10-06: The gate goes on

Streamlane made its model a required check on every pull request (Streamlane #352). The check runs two commands through `pnpm dlx`, so the product gains no dependency:

- `intentset validate --level L2 --mode migration`. [L2]{.term tip="The second of Intentset's adoption levels: records are checked against each other, and the code's structure is checked against the slices."} checks the records and the code's structure. [Migration mode]{.term tip="A setting for adopting Intentset on existing code: violations already in the baseline are warnings, not errors."} reports the violations that already existed as warnings, so only a new one fails.
- `intentset review --fail-on-drift`, the drift gate: it fails when a slice's code changed and its records did not, unless a commit says no behavior changed.

The pull request opened with 478 entries in the baseline:

- 452 for 226 imports that reach past another slice's [entrypoint]{.term tip="The one file through which other slices may use a slice. Reaching past it into a slice's other files is a violation."}, each reported twice ([VSA003 and TS006]{.term tip="Two rules that both report an import of another slice's private file: one from the slice rules, one from the TypeScript profile."}).
- 21 for imports that cross a [region]{.term tip="A broad part of the codebase, such as shared code or the app's shell, with rules about which way imports may go."} the wrong way (REG001).
- 4 for imports of the backend's client library outside the one module meant to hold them (AMP002).
- 1 for a dependency [cycle]{.term tip="Slices that depend on each other in a loop, so none of them can change alone."} (VSA005).

A commit in the same pull request routed the blocked slice's users through its entrypoint, which closed an item the first pilot had left open and removed 6 entries. The gate merged with 472. Streamlane's rule is to rewrite the baseline only when a change removes entries, never to add a new one.

The check on Streamlane's main branch then reported:

```text
86 artifacts, 0 errors, 577 warnings
Architecture (L2, migration mode): 37 active slices; 192 files claimed,
0 unclaimed, 596 out of scope (counted, not reported); 1025 import edges,
487 across slices; 1 cycle; 0 excepted, 472 baselined, 0 stale baseline entries
```

### What it achieved

- **The structure stopped getting worse.** From that day a change that adds a structural violation cannot merge. The 472 known ones are written down, and the list can only shrink.
- **Records keep up with code.** Every change to a slice's code now has to update its records or say why not.

### What it cost

The gate's first failure came on its own pull request, on its second commit. That commit changed code in two slices, the blocked state and the work views, and said so in a sentence: `Intentset-Unchanged: SLICE-WORK-BLOCKED's entrypoints and claims are as recorded; …`. Review reads that [trailer]{.term tip="A Key: value line at the end of a commit message."} as a list of slice IDs, so the sentence acknowledged neither slice:

```text
Code changed, records unchanged (2, 2 not acknowledged)
If behavior changed, update those records in this change. If it did not,
say so in a commit with the trailer `Intentset-Unchanged: <slice ID>`.
```

It listed the 21 records that describe the blocked state, the ones the first pilot said the next change would meet. A commit with one trailer per slice, `Intentset-Unchanged: SLICE-WORK-BLOCKED` and `Intentset-Unchanged: SLICE-WORK-VIEWS`, passed, and Streamlane's instructions to its agents now say one trailer per slice. Every run of the check after that passed, on main and on the next four pull requests (Streamlane #353, #355, #356 and #357), to 2026-10-06.

## 2026-10-04 to 2026-10-06: Driftline, modelled before its code

Driftline's model was written before any of its product code (Driftline #6, 2026-10-04): 26 records, all draft, each claim citing its source. They are one product, 4 intents, 6 outcomes, 8 capabilities, 6 slices and 1 decision. The model passed L2 with 0 errors and 18 warnings, all expected of a model that runs ahead of its code: each draft slice pointed to files not yet written, and no slice had behaviors yet. Driftline added the check to its pull requests that evening (Driftline #8).

### What it achieved

- **The first code was checked against a plan written before it.** The package that reads usage evidence was checked against the model in Driftline #20, which merged with 0 errors and no warnings on its slice.
- **Records reached a person the same day.** Gary approved the first records that afternoon (Driftline #21). The slice, its two behaviors and their two verification records became implemented, and the rule that evidence names no person became approved. The capability is still a draft.

### What it cost

- **No place for a measure.** The 0.5 release had no record type for a success measure, so each outcome carried its measure in a section of its own. Measures became records in 0.6.0, released that evening (ADR 0012). Driftline's six outcomes have no measure records yet; that is six of its warnings today.
- **TypeScript 7.** The architecture check needs TypeScript 7 and Driftline is on 5.9, so the command-line tool is pinned in a package of its own.

## 2026-10-06: The loop closes at runtime

Streamlane's backend now says which behaviors each call delivers (Streamlane #351, ADR 0062). The code says it with one line, `exercised(context, "BEH-…")`, and each call writes one line of [usage evidence]{.term tip="One log line per call saying which behaviors the call delivered and whether it succeeded. It names no person."} to the backend's log:

```json
{"usage":"0.1","kind":"result","op":"<operation>","org":"<org id>","outcome":"invalid","behaviors":["BEH-BLOCKED-START-GUARD"],"rule":"RULE-BLOCKED-DEFINITION","ms":38}
```

A line carries the operation, an opaque organization id, the outcome, the behaviors, and the rule that refused the call, if one did. In ADR 0062's words, "It names no person: no user id, email, name, argument, message, item id or key." The format, usage evidence 0.1, is a draft written in Driftline under the MIT licence, meant to move into Intentset once it has proved itself.

Driftline's first capability reads it back (Driftline #20). It loads Streamlane's model with `@intentset/core`, finds which behaviors Streamlane's code names, and counts the evidence for each: attempts, successes, refusals by rule, failures and accounts. A behavior that nothing names reads "no signal", never "unused". It answers from the command line and from an [MCP server]{.term tip="A standard way for AI assistants and tools to ask a program questions."}.

The read recorded on Driftline #20 covered one day of a shared test environment, where Streamlane's end-to-end tests made the calls. Each behavior's attempts came from 2 accounts, both test organizations. These are test calls, not real use.

| Behavior | Attempts | Succeeded |
|---|---|---|
| BEH-BLOCKED-START-GUARD | 34 | 34 |
| BEH-BLOCKED-REASON | 14 | 14 |
| BEH-BLOCKED-BY-LINK | 11 | 11 |
| BEH-BLOCKER-CLOSES | 2 | 2 |
| BEH-BLOCKED-SHOWN | no evidence | n/a |

Of the 3,066 lines read, 61 named a behavior. The other 3,005, across 74 operations, named none: those operations are not linked to behaviors yet.

### What it achieved

- **The product's logs can be read by behavior.** For the first time, a question like "is anyone hitting the start guard?" is answered from the logs, counted per behavior, rather than by reading code.
- **It showed a guard that is never refused.** The browser disables Start on a blocked item, so a refusal reaches the backend only from another client, such as an agent or the command line. Streamlane's tests cover the refusal.
- **It told apart unused from unmeasured.** The blocked state's display is named only in the web app, so it has no backend evidence. The report says where it is named rather than calling it unused.

### What it changed in Driftline

Two changes came from the first run: a behavior with no evidence now says where it is named, and the operations that name no behavior are cut to the busiest ten with the rest counted, so nothing is dropped silently. ADR 0062 names the second capability's 15 behaviors as the next ones to name in code.

## 2026-10-04: The model widens across Streamlane

Streamlane moved its web app into feature folders, by area and slice, without changing behavior (Streamlane #321, ADR 0058): 179 files into 35 feature folders and 4 shared ones. The architecture check's [scope]{.term tip="The files the check covers. Files outside it are counted but not checked."} was set to match.

Validation went from 0 errors to 140: 134 files that no slice claimed, and 6 for 3 imports past the blocked slice's entrypoint. Half an hour later Streamlane drafted a slice record for each of the 34 folders that had none (Streamlane #324). Each draft claims its folder, lists the dependencies it found, and names the most-imported file as its entrypoint, for the owner to confirm or change. Unclaimed files fell to 0, and errors rose to 473: 448 for 224 imports past another slice's entrypoint, 20 for region crossings, 4 for imports of the backend's client library and 1 for a cycle. In Streamlane #324's words, "declaring every slice lets the checker see the boundaries between them, and the web app does not respect them yet."

Slices went from 1 to 37, and records from 26 to 86, between 2026-10-04 and 2026-10-06.

### What it achieved

- **The whole web app became visible to the check.** With one slice declared, the check had seen only the imports into the blocked slice. With 37, it saw 224 imports past another slice's entrypoint that nobody had counted. Those became the baseline the gate holds today.

### What it cost

- **A miscount.** The ADR first said 268 unclaimed files, because `grep -c` also counted each error's `fix:` line. Streamlane #324 corrected it to 134.
- **A false positive.** Three warnings were the checker's mistake (TS004): a `/` in JSX text read as the start of a regular expression.
- **An open question.** Shared code that assembles slices crosses a region the wrong way, 21 times on that day, and ADR 0058 has not decided what to do about it. The 21 went into the baseline.

### What it changed in Intentset

The import reader now reads JSX as JSX. The fix shipped in 0.6.0 that evening, and Streamlane moved to it the same night.

## 2026-10-04: Help from the model

Streamlane put four tips on its blocked-work knowledge record and bound each to the control that delivers its behavior (Streamlane #314). `intentset publish` writes `help.json`, and the web app shows each tip, through `@intentset/help`, on every element marked `data-behavior="BEH-…"`.

### What it achieved

- **The help is tied to the behavior it explains.** Approved for publication, the record is pinned to 5 behaviors and 3 rules, so a change to any of them sends it back for review instead of leaving stale help on screen.
- **The first approval through Intentset.** It was the first Streamlane record a person approved this way. Today the file carries four tips. BEH-BLOCKER-CLOSES has none, because no control delivers it: it happens when the blocker closes.

### What it cost

The record was a draft, and publishing leaves drafts out by default, so `help.json` came out with no tips. Gary approved the record for publication before the change merged (Streamlane #315).

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
| [Rules]{.term tip="A rule is a record stating something that must always be true, such as what counts as blocked."} | 3 |
| [Scenarios]{.term tip="A scenario is a record that walks through behaviors in order, as a person would meet them."} | 2 |
| [Tests bound]{.term tip="Existing tests that a verification record names as the proof of a behavior."} | 8 |
| Records | 26 |
:::

Each of the eight verification records names a test that already existed. The agent also wrote the slice that owns the code and the contract it exposes, and the existing decision record joined the model by gaining a header, its text unchanged. Every record the agent wrote started as a draft; the decision record, already accepted, joined as approved.

### What it achieved

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

Tried against the 0.4 release, a one-line change to the slice's code was listed for review with the 21 records that describe it, which is what the next change to the blocked state would meet. It did, on 2026-10-06, when the gate went on.

[[Start with one capability](../start/index.html)]{.button .primary} [[See how it works](../how-it-works/index.html)]{.button}
