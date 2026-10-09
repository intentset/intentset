---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-EVIDENCE-IMPORT
  type: behavior
  title: Evidence import turns a test report into run records
  status: draft
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

# Evidence import turns a test report into run records

## Behavior

Someone runs `intentset evidence import --from vitest|node-tap` with a report, and gets run records bound to the current commit and graph hash, for each verification the report exercised.

## Preconditions

A test report in a supported format, and a product and release to bind to.

## Outcomes

Success: the run records are written to `--out`. Failure: when tracked files differ from the commit, the import is refused and nothing is written, because the records would name a commit the run did not test (Core §8).

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
