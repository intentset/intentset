---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-EVIDENCE-STALE
  type: behavior
  title: Evidence stale lists what needs a run, in a test runner's own arguments
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-EVIDENCE
  links:
    governedBy: [RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Evidence stale lists what needs a run, in a test runner's own arguments

## Behavior

Someone runs `intentset evidence stale` and gets the automated verifications whose evidence at the current snapshot is not a current pass: each with its selector, locator, verification ID and status (stale, missing, error, skip, current-fail or unresolved) and, for a stale subject record, the note that names the part that moved. The default is a table grouped by locator file with counts; `--format json` is a stable object with sorted entries; `--format playwright`, `vitest` or `node-test` prints the arguments that make that runner load only those files and run only those tests. A person's manual review is listed apart, because no runner re-runs it. The command never writes, and exits 0 whatever it finds; with `--check` it exits 1 when any automated verification needs a run.

## Preconditions

A repository with run records for the snapshot (none, and every automated verification is missing), and the binding in force: under subject binding, a record stays current while what it checked is unchanged, which is what lets a slow suite run only what a change moved.

## Outcomes

Success: the list, JSON or runner arguments, and a summary line naming how many of the automated verifications need a run. When nothing needs a run a runner format prints one empty line, so capturing it in `$(...)` is safe, and says so on stderr. A runner's `--grep` or `-t` matches a substring where Intentset matches whole tokens, so the arguments select every test that needs a run and possibly a few more, never fewer. Failure: an unknown format, a malformed or unknown `--release`, or a level below L3 is a usage error, exit 2.

## Sources

- ADR 0013, "Slow suites", and Core §8.
