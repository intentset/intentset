---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-MARKSET-CARRIER
  type: behavior
  title: A record written in Markset is read with Markset's own diagnostics
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
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

The record is Markdown with YAML frontmatter; plain Markdown is valid Markset.

## Outcomes

Success: the artifact is read as the plain-Markdown carrier would read it. Failure: a Markset problem is reported under origin `syntax` with Markset's own code, never renamed and never mixed with Intentset's diagnostics without the origin.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
