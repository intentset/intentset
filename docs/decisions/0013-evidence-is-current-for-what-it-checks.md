# ADR 0013: Run evidence should be current for what it checks, not for the whole commit

**Status:** accepted, 2026-10-14 (Gary, after reviewing the revision). **Amended 2026-10-15 (Gary): a resource's files count in a subject where a verification exercises the resource, not for every slice that lists it** (the Recommendation and Costs and risks sections say what changed; the earlier text stands where it is not marked superseded). **Amended 2026-10-15 (second): a dependency slice can count through its contract, as an opt-in** (`evidence.dependencies: entrypoint`; the default stays `files`, the measured finding and the decision rule are in the section "Amended 2026-10-15 (second)" below; nothing above is superseded). The export and the specifications moved for the first amendment in [ADR 0014](0014-export-0.4-carries-the-evidence-binding.md): export 0.4 carries the binding, and `intentset.spec` is `0.2`. Proposed and revised the same day; it changes Core §8. The back-test below was not run first: Gary accepted without it, so it is the first implementation step, and its result sets the closure limits and where `exercises` is required, not whether the decision stands.

## Context

Core §8 says a run record counts as current passing evidence only at the assessed commit and graph hash: the record
carries both, and `atSnapshot` (`packages/verification/src/classify.ts`) requires both to match the snapshot being
assessed. The spec calls this "deliberately conservative": no change-impact analysis, so no pretending that a change
elsewhere is safe.

Streamlane, the first product to adopt L3 beyond Intentset itself, shows what that costs once a test run is slow and
the repository moves quickly (2026-10-14):

- 247 of its 315 verification records are Playwright tests, with a suite of about 28 minutes that needs a deployed
  sandbox. It can run nightly, or on a chosen commit, but not on every commit.
- Main takes a merge every few minutes. A record made at commit X is stale at X+1 though nothing it checks changed.
- The graph hash covers every record in the model. Editing a help article, or approving an unrelated rule, makes every
  record stale on its own, with no code change at all.

So there are two bindings, each too coarse for a slow suite: the **commit** (any change to the repository) and the
**graph hash** (any change to the model). An L3 gate on them would fail on nearly every merge, or never run.

## Options

1. **Keep both.** The spec stays as strict as it is. Adopters with slow suites treat L3 as a report, and most
   evidence reads stale most of the time.
2. **Scope the graph hash only.** Hash the verification and what it verifies (the behaviors, rules and scenarios it
   names), so an unrelated record edit does not invalidate it. The commit binding stays. This fixes the model half
   and leaves the code half: evidence is still stale at every new commit.
3. **Bind to what the check is about.** A record is current while the subject it checked is unchanged: the scoped
   model hash of option 2, plus the content of the files the verified behavior's slice claims (`slice.claims`), those
   of the slices it `dependsOn`, and the test's own file. This uses what the model already says about ownership, so a
   change to a slice nobody the behavior depends on touches nothing it checked.

## Recommendation

Option 3, as the **default** wherever a repository has slices, with commit binding kept as a stricter mode a gate can
require. The first draft of this ADR made subject binding opt-in. That was wrong for the direction the family is
building toward: work done by agents arrives as many small commits in quick succession, and commit binding makes
evidence useless in exactly that flow, so an opt-in would make the intended way of working the exception. Intentset's
specifications are 0.1 drafts with the family's own products as the adopters, so changing the default now costs
little and later would cost a great deal.

- **`binding: subject` is the default.** A record is current while its subject is unchanged (below).
- **`binding: commit` is the existing rule, named.** A gate that needs "this commit was tested at this commit" asks
  for it: a release, and the compliance evidence a product keeps for its own users. A release then needs the suite run
  at the tag, while ordinary merges are judged on the subject. The two are used at different gates and neither
  replaces the other.
- **No slices, no subject.** A repository with no slice claims (no L2 architecture) cannot compute a subject, so it is
  judged by commit binding and every report says so with a diagnostic. It never falls back silently.

**The subject of a record** is hashed from:

- the verification record and what it verifies (its behaviors, their rules and scenarios);
- the slices that implement those behaviors, those they `dependsOn` (transitively) and those the verification
  **declares it exercises** (below): for each, its **binding fields** (`implements`, `dependsOn`, `claims`,
  `usesResources`, `entrypoints`) and the files its claims resolve to, and the files of every resource it `usesResources` *(superseded 2026-10-15: a resource's files count only where a verification exercises it, below)*;
- the test's own file and the **local files it imports**, transitively, such as an end-to-end helper or fixture;
- the repository's **global inputs**.

Three additions to the first draft, each found by asking what a hash of files cannot see; the back-test over
Streamlane's last 300 commits (`docs/adoption/subject-binding-backtest.md`, 2026-10-14) measured the gaps:

- **A verification declares what it exercises** (`verification.exercises`, a list of slice or resource IDs, optional).
  An end-to-end test drives the whole stack, and a product whose web and backend slices talk through an API, not
  imports, has no `dependsOn` between them; Streamlane's are like that. A verification that declares nothing is judged
  on the behavior's slices only, and the report says it declares nothing. Declaring is needed where the behavior's own
  slices do not reach the code the test drives: the back-test found one such case in six replayed fixes (a delivery
  strip test whose backend change lay outside its closure), and 20 of the 21 end-to-end verifications whose behavior
  changed with the code moved through the behavior's slices alone.
- **Resources and the slice record count, but only the parts that bind.** Files no slice claims are the largest gap:
  129 of the 172 code-changing commits touched a file outside every claim (backend resources, shared and composition
  code), invisible to a hash of claimed files. *(Superseded 2026-10-15: see the amendment below.)* A slice's `usesResources` is declared and checked by VSA, so the files
  of the resources it uses are in its subject (about 6.5 points of per-commit currency, 87.6% against 94.1%, the price
  of closing it). The slice record took part in 64% of subject moves, because it is hashed whole: only the binding
  fields above count, so a prose edit to a slice does not move a subject. A behavior, rule, scenario or verification
  is hashed whole, since its prose is its promise.
- **Global inputs** (`evidence.globalInputs`, in `.intentset/config.yaml`): files whose change affects every check
  and belong to no slice, such as the lockfile and the toolchain version files. They are mixed into every subject hash.
  The back-test found that a lean set (the lockfile, the workspace file, the TypeScript configurations and the version
  files) kept 94.1% of evidence per commit while adding `package.json` and the workflows kept 92.3%; each moves every
  subject when it changes, so the set is a choice and each entry is named in the configuration. What no file holds (the
  deployed environment, its data, a service's version) stays outside the binding, and a record's `environment` field
  says which environment it ran in.

**Amended 2026-10-15 (Gary): a resource's files are hashed where a verification exercises them.** The rule above hashed the files of
every resource every included slice lists, and Streamlane's first browser run showed what that costs on a web product. The run was imported
and judged at a later commit, and only 5 of 274 browser verifications read current. The notes named the causes: 133 verifications went stale
because five `amplify-docs` backend files changed (a web slice that lists the docs backend in `usesResources` hashed all of those files for each
of its verifications), and three central slices (`SLICE-PLATFORM-ORGANIZATION` 85, `SLICE-PLATFORM-PEOPLE` 44, `SLICE-WORK-ITEMS` 34) sit in
nearly every closure. Measured on real data, the first resource rule made evidence meaningless for the web, which is the opposite of what the
binding is for. From this amendment:

- **A resource's files count in a subject where the verification names the resource**: in `verification.exercises`, which already takes
  slice or registry resource IDs, or where the resource belongs to a slice whose own files the subject already includes by being an
  implementing slice: the slice lists it in `usesResources` and also claims a file the resource's path matches (a backend slice's own
  resource, whose files then count as its claims do). A slice that implements a verified behavior and only talks to a backend does not
  put that backend's files in the subject of every one of its verifications.
- **The slice record's binding fields still count**, `usesResources` among them, so adding a resource to a slice or removing one still
  moves its subject.
- **A report says what the binding could not see** (`EVID006`, a warning): when a current record's verification has slices that list a
  resource it does not exercise and a file of that resource changed since the record's commit, the report counts those verifications and
  names the resource, its changed files and the verifications (the first twenty verifications and five files a resource), so a
  repository can add `exercises` where a check does depend on the resource. It reuses the one `git diff` that EVID005 asks for, and
  EVID005 no longer lists a file EVID006 already names.
- **A switch keeps the stricter rule**: `evidence.resources: exercised | used` in `.intentset/config.yaml`, default `exercised`; `used`
  is the rule of release 0.7.0 and reproduces its subject hashes exactly (it did for 237 of 237 records of Streamlane's store). Anything
  else is CFG001. A subject-bound record made under the 0.7.0 rule carries a hash the new default does not compute for a verification whose
  slices list resources, so it reads stale until it is imported again.
- **What did not change.** The export carries nothing new: EVID006 is one more diagnostic, and the evidence report's `binding` and `note`
  fields are as before (ADR 0014). `intentset.spec` did not move: no case in the conformance suite changed its `valid` or `diagnostics`
  (the cases that test the 0.7.0 rule say `resources: used` in their configuration, as the commit-rule cases say `binding: commit`).

The back-test was run again with the same script over the same 300 Streamlane commits, under the current subject hash (a slice's binding
fields, which the first run's stage 1 hash did not yet separate), and is appended to `docs/adoption/subject-binding-backtest.md`. The
narrower rule keeps a median 97.2% of verifications current per commit, against 92.3% under `used`; and the share of records still current one commit later is
78.7% against 74.8%. The replay of the known breakages (#891, #666, #678, #650, #653, #828 and every strong pair in the window) found no
fix that the old rule saw and the new one does not: 26 of 27 strong pairs move through code under each rule, and the one that moves under
neither, #650 `TEST-DELIVERY-STRIP`, is the case `exercises` was added for (it would need to name `RES-WORK-BACKEND` or `SLICE-WORK-ITEM-PAGE`).
Replayed over Streamlane's own store of 237 records, the narrower rule does not by itself bring the browser evidence back: at 13 commits
after the records' own, 5 of 237 verifications are current under either rule, because the slices that moved
(a change to `SLICE-PLATFORM-ORGANIZATION` moved 227 of the 237 subjects, `SLICE-PLATFORM-PEOPLE` 186, `SLICE-WORK-ITEMS` 176) dominate. The second cause the run
named, the central slices, is not addressed here.

**Amended 2026-10-15 (second): a dependency counts through its contract, as an opt-in.** Amendment 1 left a second cause of the browser store's staleness
open: "the central slices, which sit in nearly every closure, is not addressed here". The candidate rule, `evidence.dependencies: entrypoint | files`: a
**dependency** slice (reached only through `dependsOn`: not a slice that implements a verified behavior and not one the verification `exercises`)
contributes its binding fields, the files its `entrypoints` name (its public surface, VSA §3) and the records of the contracts it `exposes` or
`consumes` and the decisions those contracts are `informedBy`, and not its other claimed files; a verification's own implementing slices and its
`exercises`-named slices still contribute every file and, per amendment 1, their own resources. `files` is the rule of 0.7.0 and amendment 1. Before the
change it was measured with `scripts/subject-backtest.ts --dependencies-section`, over the same 300 Streamlane commits (76969df09 to 852c5f09e) and a
replay of the 237 browser records made at 63fd216e3, judged at origin/main (ea7d2808d, 15 commits later), against a decision rule written before the
run: `entrypoint` becomes the default only if it keeps at least 60% of the 237 records current at the later commit and its replayed fixes show no more
than 2 false greens; otherwise it is an opt-in. The figures are in `docs/adoption/subject-binding-backtest.md`, "Amendment 2026-10-15 (second)":

- **Per commit it helps:** a median 98.0% of verifications kept current per commit against 97.2% (worst decile 6.5% against 4.5%; newest third 47.3%
  against 21.8%), 85.4% still current after one commit against 78.7% (50.1% against 37.6% after five), and a median 17 files hashed per verification
  against 87.
- **On the store it does not:** 5 of 237 records current under either rule (10 of 237 at each of the first ten later commits, then 5). The central
  slices that `files` moved through their internals, `SLICE-PLATFORM-PEOPLE` (186 of 237) and `SLICE-WORK-ITEMS` (176), stop moving, but
  `SLICE-PLATFORM-ORGANIZATION` still moves 227 of 237 because its entrypoint `session-provider.tsx` and its record's `implements` really changed
  (public teams and organizations, #951 to #963), and `SLICE-WORK-COMMENTS` 135 for the same reason. A dependency counted through its contract cannot hide a
  contract that changed.
- **False greens:** over the 299 steps a file a dependency claims outside its entrypoint changed in 95 steps, at 43 of which `entrypoint` kept current
  verifications `files` would have invalidated (3464 verification-step pairs, 269 distinct verifications); 19 of the 57 replayed fix commits moved some
  verification under `files` that stayed current under `entrypoint`. Of the 27 strong pairs (a fix and a verification of a behavior it changed) 26 move
  through code under both rules and none is moved by `files` alone: **0 false greens against a limit of 2.** The one pair neither rule sees, #650
  `TEST-DELIVERY-STRIP`, is the one amendment 1 attributed to a missing `exercises`.
- **The decision rule:** the gain (5 of 237, against 60%) is under the bar, so **the default does not change: `files` stays the default and `entrypoint`
  ships as an opt-in.** The false-green condition would have passed.

What ships, either way: the key (CFG001 for an unknown value), the rule in `computeSubject` and the architecture package's `subjectSource`, Core §8 and
§11, a warning, EVID007, that says how many verifications are current though a file of a slice they depend on changed outside its entrypoints and
contracts and names the slice, its changed files (first five) and the verifications (first twenty), reusing the one `git diff` EVID005 and EVID006 ask
for, and conformance cases (S cases D01 to D04: an internal change keeps a record current under `entrypoint` and moves it under `files`; an entrypoint
file, a contract record, a decision a contract names, a dependency's `dependsOn` and its claims move it; the implementing slice's own files and an
exercised slice still count fully; EVID007 lists the unseen change). `intentset.spec` did not move and no existing case changed. Two parts the
amendment decided: a dependency's contract records are the contracts it `exposes` or `consumes` (the brief called them its `contracts` links, which are
these two) and the decisions they name, each by the hash of its whole record; and a dependency's file that another part of the subject hashes (the test, a
global input, an entrypoint of another slice) is not reported by EVID007. A repository whose slices have small, stable public surfaces can choose
`entrypoint` today, and EVID007 says what it cost; the figures above say it does not rescue a store whose central slices keep changing their entrypoints.

**Unclaimed files are reported, not hidden.** A file that changed between a record's commit and the assessed commit,
and that no slice claims and no resource or global input names, cannot move any subject. The report lists such files
(`EVID005`, a warning; EVID003 was already the locator check, and the fallback below is EVID004), so a repository sees what the binding could not see, and the architecture check's unclaimed
files rule is what removes them.

## Costs and risks

- **Claims become trust-bearing.** A slice's claimed files were an ownership and architecture matter; they now decide
  whether evidence is current. Too wide a claim (`apps/web/**`) makes the hash cover everything and quietly returns
  the commit rule's behavior; too narrow a claim, or a file nobody claims, gives a false green. The architecture
  check already reports unclaimed files as errors in strict mode, which is the control; a claim wider than the files the
  slice's imports reach could be reported as a warning.
- **A larger specification.** Every reader of the export must compute a subject identically, so the hashing is
  specified canonically and ships with conformance cases: a record kept current across an unrelated commit, made stale
  by a change to a claimed file, a dependency's file, the test file, an exercised slice, a global input, or the verified
  behavior.
- **A weaker default statement.** At the default, a current record says the check's subject is unchanged since it
  passed, not that the commit as a whole was tested. The commit mode exists so that a gate that needs the stronger
  statement can ask for it.
- **Amended 2026-10-15 (second): `entrypoint` is the weaker statement.** A repository that sets it accepts that a check which drives a dependency
  without declaring it (`exercises`) can read current after a change to the dependency's internals. EVID007 reports every such case, and the replay
  found none among the fixes that repaired a behavior, but a slice whose public surface says less than its behavior does is a gap the control (the diagnostic
  and `exercises`) must close by review.
- **Large dependency closures.** Measured on Streamlane: the median verification hashes 8 slices and 87 files, the 90th
  percentile 26 slices and 200 files, the largest 32 slices and 228 files, and six slices have a closure of at least half
  the model. A change to a central slice makes most evidence stale. That is honest. There is no cap, because the wide
  ones are the central slices; a warning above the 90th percentile names the noisy ones.
- **A subject cannot make slow evidence last.** At Streamlane's merge rate (about 60 a day) the share of evidence still
  current is 75% after one commit, 31% after five, 13% after ten and 3% after twenty-five. Subject binding makes
  per-merge unit runs useful and does little for a 28-minute nightly browser suite, whose evidence is stale by the next
  merge. That is a property of the repository's pace, and the tail is heavy (a commit that touches a central slice moves
  nearly every subject).

- **Amended 2026-10-15: a green subject says less about a backend.** Under the narrower rule a change to a resource's files that no
  verification exercises and no implementing slice owns does not make a record stale, which was the false-green gap amendment 1 closed. The
  exposure is real: in the back-test EVID006 would have reported at 41 of 299 steps, a median 47 verifications at those steps (at most 154 of
  315), where a resource their slices list changed and they do not exercise. The control is the diagnostic and `exercises`: a repository adds
  the resource to the verifications that depend on it, and `evidence.resources: used` restores the old rule for a repository that prefers
  currency to be conservative. The cost of the old rule on the same history was 4.9 points of per-commit currency (92.3% against 97.2%) and,
  on Streamlane's store, a change to five files of the docs backend moved the subject of 133 verifications.

## Consequences if accepted

- Core §8 gains both bindings and the rule for choosing; the run record schema gains optional `subjectHash` and
  `binding`; the verification metadata gains optional `exercises`; the configuration gains `evidence.binding` and
  `evidence.globalInputs`; the export's evidence report says which binding judged each record and what a verification
  declares.
- Streamlane runs its unit tests per commit and its browser suite nightly, and a record stays current for as long as
  its subject is unchanged. Its L3 gate can name a scope and mean it, and a release gate can require commit binding.

## The back-test (done 2026-10-14)

Streamlane's last 300 first-parent commits (2026-10-10 to 2026-10-14) were replayed with `scripts/subject-backtest.ts`;
the figures are in `docs/adoption/subject-binding-backtest.md`. Under commit binding 0% of evidence is current at any
commit; under the lean subject a median 94.1% is, and a median 95.8% of the end-to-end verifications. The known
breakages replayed (#891 and four of five other fixes) moved the right verification's subject; the one that did not
(#650) is the case for `exercises` and for hashing resources. The amendments above answer what the replay found.

## Slow suites

Subject binding makes a record last as long as its subject is unchanged, and it also says exactly which records are
stale. That second property is the one a slow suite needs: **run the verifications whose subject moved, not the whole
suite.** A merge that touches one slice moves the subjects of the verifications around it, and a runner selects just
those tests (`intentset evidence stale`, listing the selectors whose records are no longer current), so a per-merge
browser run covers what the merge could have changed. A central-slice change still moves nearly everything, and that
merge needs the full suite; the nightly run is the backstop for what the declarations missed. This is the intended use
and is built after the binding itself.

## Not decided here

Whether a record may be current across a bounded number of commits as a looser alternative for suites that cannot be
selected this way; Streamlane's first selected runs, imported with `--from playwright`, give the figures.

## Implementation, stage 2 (2026-10-14)

Core §8 and §11, the run record and frontmatter schemas, `evidence:` in `.intentset/config.yaml`, the classifier, `evidence import`, the
unclaimed-files warning and the conformance cases (the S cases of `tests/evidence.json`) are built. What the build decided where this text left it open:

- **Codes.** EVID003 was taken (a locator that is not a file), so the unclaimed files are EVID005 and the fallback for a repository
  with no slice claims is EVID004.
- **What a current subject record needs.** `binding: subject` and a `subjectHash` equal to the subject at the snapshot. A record with no
  `binding` is a commit record, and each is stale, with a note, under the other binding, even at the snapshot's own commit: a gate that
  asks for commit binding asks for a run imported with it (`--binding commit`).
- **Which binding.** `evidence.binding` in the configuration, or `--binding` for one command, else subject where a slice that is not
  retired has claims, else commit with EVID004. Asking for subject where nothing claims files is judged by commit all the same.
- **What moved.** A record holds a hash, not its parts, so a stale record names the parts by asking git what changed between its commit
  and the assessed one and naming the subject's parts whose file or record is on that list. A prose edit to a slice record is named
  too, since the list cannot tell it from a change to a binding field; the hash decided that the subject moved.
- **Test imports.** The test's local imports are followed with the architecture package's resolver and not out of the test's package;
  an import of another workspace package is not in the subject unless a slice the check reaches claims it.
- **The export did not move.** 0.3 states a status at the snapshot's commit and graph hash, its reader rejects a current status whose
  latest record is not at that snapshot, and its record schema is closed. Subject binding has no place in it without a new version, so the
  export classifies evidence by commit whatever the repository uses, reads each record as a commit record, says so in every `note`, and
  carries neither `binding` nor `subjectHash` nor `exercises`. A consumer therefore sees `stale` for a record the repository's own gate
  accepts, until a version carries the binding (export §7). That version is 0.4 ([ADR 0014](0014-export-0.4-carries-the-evidence-binding.md)), which states the repository's own verdict and carries the binding, and the specifications moved to `0.2` with it.
