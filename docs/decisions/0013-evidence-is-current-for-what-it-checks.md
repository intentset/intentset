# ADR 0013: Run evidence should be current for what it checks, not for the whole commit

**Status:** proposed, 2026-10-14. Not accepted: it changes Core §8, and nothing is built until the maintainers accept it.

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

Option 3, as an opt-in in `.intentset/config.yaml` (`evidence.binding: subject`), with option 1 staying the default.
Opt-in keeps the claim honest: Core §8's worry is that change-impact analysis can prove unrelated code safe wrongly.
Here the analysis is the one the architecture check already runs, owned by the slice record and enforced by VSA
(an import past a slice's entrypoint, or from a slice it does not declare, is an error), so the set of files a check
can depend on is already declared and checked rather than inferred. What it still cannot see is behavior that flows
through something no slice claims (configuration, the deployed environment, data). Those stay outside the binding and
the record's `environment` field says so.

A record under subject binding carries a `subjectHash` instead of relying on the snapshot's commit and graph hash, and
a tool says which binding judged a record. A repository that does not opt in is judged as before, so no existing run
record, case or export changes meaning.

## Consequences if accepted

- Core §8 gains the binding and its rule; the run record schema gains an optional `subjectHash` and `binding`; the
  export's evidence report says which binding judged each record; conformance cases cover a record kept current across
  an unrelated commit and made stale by a change to a claimed file, a dependency's file, the test file and the
  verified behavior.
- Streamlane runs its browser suite nightly and its unit tests per commit, and a record stays current for as long as the
  slice's files and the model records around it are unchanged. Its L3 gate can then name a scope and mean it.
- A slice whose `claims` are wrong (a file missing from them) would let evidence stay current when it should not. The
  architecture check already reports unclaimed files, which is the control; this decision makes claims matter more.

## Not decided here

How large a `dependsOn` closure is acceptable (Streamlane's shared packages put many slices in each other's closure),
and whether a record may be current across a bounded number of commits as a looser alternative. Streamlane's first
nightly runs, imported with `--from playwright`, give the figures to decide on.
