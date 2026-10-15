---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/capability/0.2
  id: CAP-EVIDENCE
  type: capability
  title: Say which checks pass at this commit
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: OUT-REVIEW-THE-PRODUCT
---

# Say which checks pass at this commit

## Overview

Turn test reports into run records bound to what each check is about, or to a commit and a graph hash, and report coverage by links and by current passes separately (Core invariant 3).

## Sources

- `CLAUDE.md`, the layout and the Core API.
