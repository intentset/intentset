# ADR 0026: One rule for what a subject holds

**Status:** proposed, 2026-11-24 (issue #127). Not accepted: the decision is the product owner's. Part of the move to
`0.3`, with ADR 0023, ADR 0024 and ADR 0025. Amends
[ADR 0013](0013-evidence-is-current-for-what-it-checks.md).

## Context

Under subject binding a run record stays current while the subject its check is about is unchanged (Core §8, ADR
0013). Two configuration keys change what a subject holds, and both record how the rule was arrived at:

- `evidence.resources: used` hashes the files of every resource an included slice lists. It was the rule from release
  0.7.0 until ADR 0013's first amendment on 2026-10-15 replaced it with `exercised`, the default, and it was kept as
  an option.
- `evidence.dependencies: entrypoint` makes a slice reached only through `dependsOn` contribute its entrypoint files
  and contract records, where `files`, the default, contributes every claimed file. ADR 0013's second amendment added
  it as an opt-in because its back-test did not clear the bar for becoming the rule.

So a subject hash means one of four things, and a reader of an evidence report has to know which. The second key
brought two part kinds (`contract`, `decision`) and a warning, EVID007, that says what `entrypoint` cannot see. Design
invariant 6, checks report what they could not check, is kept, at the price of a mode whose own report is a list of
what it missed.

## Decision

**A subject is computed one way. `evidence.resources` and `evidence.dependencies` are removed.**

- A resource's files are in a subject where a verification exercises the resource or an implementing slice owns it:
  the rule that `exercised` named. EVID006, which reports what that rule cannot see, stays.
- A dependency slice contributes every file its claims resolve to: the rule that `files` named. The `contract` and
  `decision` parts and EVID007 go with `entrypoint`.
- Either key in `.intentset/config.yaml` is CFG001, as any unknown key is. `evidence.binding` and
  `evidence.globalInputs` are unchanged.
- A subject hash computed under the defaults does not change, so a repository that set neither key keeps its current
  passes.

**Reopening.** A narrower dependency rule comes back as the rule, not as an option, if a back-test on an adopter's
store clears ADR 0013's bar. The amendment's method and numbers stay in ADR 0013 for that.

## Rejected

- **Make `entrypoint` the default.** ADR 0013's own measurement said no, and it hides a change to a dependency's
  internals from every check that depends on it.
- **Keep both as options.** An option with no known user still has to be specified, tested and explained in every
  report.
- **Keep `used` for a repository that wants the stricter rule.** It made one backend change stale every verification
  of every slice that talks to that backend, which is why it stopped being the rule.

## Consequences

- **Breaking** for a repository that sets either key: its configuration stops with CFG001. That invalidates existing
  cases, so it belongs in the move to `0.3`.
- In the suite the two values appear 25 times: `used` in `tests/evidence.json` (4) and `tests/core.json` (1),
  `entrypoint` in `tests/evidence.json` (19) and `tests/core.json` (1). Those cases are removed or become CFG001 cases.
- `Config.evidence`, `subjectSource`'s options and `computeSubject`'s `dependencyInternals` shrink.
- The checkouts of the two adopting repositories beside this one set neither key, read on 2026-11-24. That is a
  reading of two local checkouts, not of their default branches.
