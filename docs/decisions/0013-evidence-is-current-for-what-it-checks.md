# ADR 0013: Run evidence should be current for what it checks, not for the whole commit

**Status:** proposed, 2026-10-14, revised the same day after review. Not accepted: it changes Core §8, and nothing is built until the maintainers accept it.

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

**The subject of a record** is hashed from: the verification record and what it verifies (its behaviors, their rules
and scenarios); the files claimed by the slices that implement those behaviors and by the slices they depend on; the
test's own file; the files claimed by any slice the verification **declares it exercises** (below); and the repository's
**global inputs**.

Two additions that the first draft lacked, each found by asking what a hash of files cannot see:

- **A verification declares the slices it exercises** (`verification.exercises`, a list of slice IDs, optional). An
  end-to-end test drives the whole stack, and a product whose web and backend slices talk through an API, not imports,
  has no `dependsOn` between them; Streamlane's are like that. Without the declaration a backend change could break a
  browser test while its evidence stayed current. A verification that declares nothing is judged on the behavior's
  slices only, and the report says it declares nothing.
- **Global inputs** (`evidence.globalInputs`, in `.intentset/config.yaml`): files whose change affects every check
  and belong to no slice, such as the lockfile, the toolchain version file, the TypeScript configuration and the CI
  workflow. They are mixed into every subject hash. What no file holds (the deployed environment, its data, a service's
  version) stays outside the binding, and a record's `environment` field says which environment it ran in.

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
- **Large dependency closures.** Streamlane's shared packages put many slices in each other's closure, so a change
  to a shared package makes most evidence stale. That is honest, and it makes the gate noisy for that change.

## Consequences if accepted

- Core §8 gains both bindings and the rule for choosing; the run record schema gains optional `subjectHash` and
  `binding`; the verification metadata gains optional `exercises`; the configuration gains `evidence.binding` and
  `evidence.globalInputs`; the export's evidence report says which binding judged each record and what a verification
  declares.
- Streamlane runs its unit tests per commit and its browser suite nightly, and a record stays current for as long as
  its subject is unchanged. Its L3 gate can name a scope and mean it, and a release gate can require commit binding.

## Before it is accepted: a back-test

Replay Streamlane's history. For each past commit, would subject binding have marked stale the evidence of the tests
that failed, or that the commit changed behavior for? The commits that broke a pinned record on 2026-10-11 (#678,
#666, #690, #702, #704, #720), the settings-read loop fixed in #891 and the cut-map sentence fixed in #891 are known
cases. The result decides how large a closure is acceptable and whether declaring `exercises` is needed on every
verification or only on the end-to-end ones.

## Not decided here

Whether a record may be current across a bounded number of commits as a looser alternative; Streamlane's first nightly
runs, imported with `--from playwright`, give the figures.
