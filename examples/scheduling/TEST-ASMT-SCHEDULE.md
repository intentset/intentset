---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/verification/0.1
  id: TEST-ASMT-SCHEDULE
  type: verification
  title: Review student assessment scheduling behavior
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  links:
    verifies:
    - BEH-ASMT-SCHEDULE
    - RULE-ASMT-FUTURE
    - RULE-ASMT-AUTH
    - SCN-ASMT-SCHEDULE
  verification:
    method: manual
    locator: examples/scheduling/TEST-ASMT-SCHEDULE.md
    selector: schedule-review-v1
---

# Review student assessment scheduling behavior

## Procedure

In a pilot environment, run: authorized published/future request; past-time rejection; unauthorized-class rejection; unpublished rejection; student access before and after release. Record inputs, observed outputs, environment, commit, graph hash, and reviewer. This procedure has not been executed.

## Expected result

The valid request is recorded, rejected requests create no schedule, and student access follows the reviewed release-time tolerance. The procedure cannot pass until that tolerance is defined.
