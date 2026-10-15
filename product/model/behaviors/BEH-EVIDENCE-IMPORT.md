---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-EVIDENCE-IMPORT
  type: behavior
  title: Evidence import turns a test report into run records
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 4
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

# Evidence import turns a test report into run records

## Behavior

Someone runs `intentset evidence import --from vitest|playwright|node-tap` with a report, and gets run records for each verification the report exercised (a selector two verifications share gives each of them a record from the same tests), carrying the current commit and graph hash and, where subject binding is in force, the hash of the verification's subject, so each record stays current while that is unchanged.

## Preconditions

A test report in a supported format, and a product and release to bind to.

## Outcomes

Success: the run records are written to `--out`. Failure: when tracked files differ from the commit, the import is refused and nothing is written, because the records would name a commit the run did not test (Core §8).

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
