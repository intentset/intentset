---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-EVIDENCE-CURRENT
  type: behavior
  title: Only a pass whose binding holds counts
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-EVIDENCE
  links:
    governedBy: [RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Only a pass whose binding holds counts

## Behavior

The evidence report reads run records and gives each verification's status under the binding in force, with link coverage and current-pass coverage reported apart. Under subject binding, the default where slices claim files, a record is current while the subject it checked is unchanged; under commit binding, which a repository or a gate asks for, only at the assessed commit and graph hash. The report says which binding judged each verification and, for a stale subject record, which part of the subject changed.

## Preconditions

Run records outside the repository, never committed.

## Outcomes

Success: a pass whose binding holds is current: a subject record with the subject's hash, or a commit record at the assessed commit and graph hash. Failure: stale, skip, error, fail and missing are reported as what they are and never counted as a pass; a commit record under subject binding, and a subject record under commit binding, are stale with a note; a repository with no slice claims is judged by commit binding and says so (EVID004); files changed since a current record that nothing claims are listed (EVID005).

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
