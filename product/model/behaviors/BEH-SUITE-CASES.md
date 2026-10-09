---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-SUITE-CASES
  type: behavior
  title: The conformance suite is published as data
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-CONFORMANCE
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# The conformance suite is published as data

## Behavior

Another implementation installs `@intentset/conformance-suite` and reads the cases, the export consumer fixtures and the schemas, the same ones this implementation is checked against.

## Preconditions

None: the package has no dependencies.

## Outcomes

Success: every case names its section, its inputs and the diagnostics expected. Failure: none to handle; a case the package lacks is a defect in the release.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
