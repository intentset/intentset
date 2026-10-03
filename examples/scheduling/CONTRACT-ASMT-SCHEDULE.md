---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/contract/0.1
  id: CONTRACT-ASMT-SCHEDULE
  type: contract
  title: ScheduleAssessment contract
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
---

# ScheduleAssessment contract

## Interface

Input: assessmentId, classId, releaseAt (UTC timestamp). Success: scheduleId. Rejections: unauthorized, unpublished, invalid-time. Draft transport representation is not yet selected.

## Compatibility

Removing a field or tightening accepted times is breaking. Consumers must be reviewed when preconditions change.
