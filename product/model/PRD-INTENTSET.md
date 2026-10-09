---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/product/0.1
  id: PRD-INTENTSET
  type: product
  title: Intentset
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# Intentset

## Scope

Intentset is the v0.1 specifications, the conformance suite, the reference implementation in TypeScript (the ten `@intentset/*` packages on npm) and the intentset.org site. This model describes what the reference implementation promises the people and agents who use it, which package delivers each promise, and the rules the packages keep. The specifications in `spec/` stay the normative text: a record here points at a section, it does not restate or replace it.

The model covers the packages under `packages/`. The site, the specifications and the conformance cases are outside it: the site is composition over the CLI, and the specifications and cases are checked by the conformance harness and the repository's tests rather than described by records.

Every record is a draft until a maintainer promotes it.

## Sources

- `CLAUDE.md`, the design invariants and the layout.
- `README.md`.
