# ADR 0013: Run evidence should be current for what it checks, not for the whole commit

**Status:** accepted, 2026-10-14 (Gary, after reviewing the revision). The export and the specifications moved for it in [ADR 0014](0014-export-0.4-carries-the-evidence-binding.md): export 0.4 carries the binding, and `intentset.spec` is `0.2`. Proposed and revised the same day; it changes Core §8. The back-test below was not run first: Gary accepted without it, so it is the first implementation step, and its result sets the closure limits and where `exercises` is required, not whether the decision stands.

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
  `usesResources`, `entrypoints`) and the files its claims resolve to, and the files of every resource it `usesResources`;
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
  code), invisible to a hash of claimed files. A slice's `usesResources` is declared and checked by VSA, so the files
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
- **Large dependency closures.** Measured on Streamlane: the median verification hashes 8 slices and 87 files, the 90th
  percentile 26 slices and 200 files, the largest 32 slices and 228 files, and six slices have a closure of at least half
  the model. A change to a central slice makes most evidence stale. That is honest. There is no cap, because the wide
  ones are the central slices; a warning above the 90th percentile names the noisy ones.
- **A subject cannot make slow evidence last.** At Streamlane's merge rate (about 60 a day) the share of evidence still
  current is 75% after one commit, 31% after five, 13% after ten and 3% after twenty-five. Subject binding makes
  per-merge unit runs useful and does little for a 28-minute nightly browser suite, whose evidence is stale by the next
  merge. That is a property of the repository's pace, and the tail is heavy (a commit that touches a central slice moves
  nearly every subject).

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
