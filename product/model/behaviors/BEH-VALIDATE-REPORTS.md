---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-VALIDATE-REPORTS
  type: behavior
  title: Validate reports every problem in the model as a diagnostic
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-VALIDATE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC, RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Validate reports every problem in the model as a diagnostic

## Behavior

A developer or an agent runs `intentset validate`. Every record in the configured scope is read and checked at the configured level, and each problem is reported with its code, severity, origin, artifact, path, location when known, field and remediation, sorted, with a count of artifacts, errors and warnings. A code names one kind of thing to fix (Core §11, ADR 0024): CORE010 a document that cannot be read, CORE011 a missing heading or section, CORE001 a field, CORE003 a link that does not resolve, CORE012 a record past draft that lacks a relationship it must have; the field pointer says which field.

## Preconditions

A `.intentset/config.yaml` in the directory or one above it.

## Outcomes

Success: exit 0 when no diagnostic is an error. Failure: exit 1 when any is; exit 2 with a message naming `intentset init` when there is no configuration, or when the command is invoked wrongly. No file is changed in any case.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
