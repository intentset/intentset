---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/decision/0.1
  id: ADR-ASMT-SEAM
  type: decision
  title: Keep backend access behind the slice seam
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
---

# Keep backend access behind the slice seam

## Context

Frontend and backend resources may live in different directories while serving one product behavior.

## Decision

The scheduling client adapts transport into domain results. The backend handler enforces authorization and rules; shared data composition has a technical owner.

## Consequences

Ownership stays explicit without moving all cloud resources into a frontend feature. Imports and bundle contents require checking.
