---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/capability/0.1
  id: CAP-VALIDATE
  type: capability
  title: Check the records
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: OUT-MODEL-STAYS-TRUE
---

# Check the records

## Overview

Read every record in the declared scope and report each problem as a diagnostic, at the level the repository asks for (Core §11). Markset documents and plain Markdown are both carriers.

## Sources

- `CLAUDE.md`, the layout and the Core API.
