---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/scenario/0.1
  id: SCN-ASMT-SCHEDULE
  type: scenario
  title: Accept an eligible schedule
  status: draft
  owner: team-assessment
  visibility: internal
  audiences:
  - engineering
  - product
  revision: 1
  links:
    illustrates:
    - BEH-ASMT-SCHEDULE
---

# Accept an eligible schedule

## Given

An authorized teacher, a published assessment, and a future release time.

## When

The teacher schedules the assessment for a class they manage.

## Then

The system records the schedule and does not expose the assessment to students before its release time.
