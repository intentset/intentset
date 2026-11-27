---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-EVIDENCE-CURRENT
  type: behavior
  title: Only a pass whose binding holds counts
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 4
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

The evidence report reads run records and gives each verification's status under the binding in force, with link coverage and current-pass coverage reported apart. Under subject binding, the default where slices claim files, a record is current while the subject it checked is unchanged, and a resource's files are part of that subject only where the verification exercises the resource or an implementing slice owns it and a slice reached only through `dependsOn` contributes every file it claims, by the one rule no configuration changes (ADR 0026); under commit binding, which a repository or a gate asks for, only at the assessed commit and graph hash. The report says which binding judged each verification and, for a stale subject record, which part of the subject changed.

## Preconditions

Run records outside the repository, never committed.

## Outcomes

Success: a pass whose binding holds is current: a subject record with the subject's hash, or a commit record at the assessed commit and graph hash. Failure: stale, skip, error, fail and missing are reported as what they are and never counted as a pass; a commit record under subject binding, and a subject record under commit binding, are stale with a note; a repository with no slice claims is judged by commit binding and says so (EVID004); files changed since a current record that nothing claims are listed (EVID005); and where a current record's slices list a resource its verification does not exercise and a file of it changed, the verifications are counted and listed (EVID006), so a repository sees what the binding could not; a configuration that sets `evidence.resources` or `evidence.dependencies` is CFG001.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API; Core §8, and ADR 0026 for the one rule of what a subject holds.
