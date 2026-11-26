---
markset: true
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-MARKSET-CARRIER
  type: behavior
  title: A record written in Markset is read with Markset's own diagnostics
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-VALIDATE
  links:
    governedBy: [RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A record written in Markset is read with Markset's own diagnostics

## Behavior

A record in the scope is read as a Markset document. Its frontmatter becomes the artifact, and its headings the sections the record type requires.

## Preconditions

The record is Markdown with YAML frontmatter that declares Markset with `markset: true`, or with the original `markset: 0`, which means the same (Core §3); any other value is CORE001. Plain Markdown is valid Markset.

## Outcomes

Success: the artifact is read as the plain-Markdown carrier would read it. Failure: a Markset problem is reported under origin `syntax` with Markset's own code, never renamed and never mixed with Intentset's diagnostics without the origin.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
