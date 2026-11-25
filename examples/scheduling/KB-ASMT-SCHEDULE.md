---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/knowledge/0.3
  id: KB-ASMT-SCHEDULE
  type: knowledge
  title: Prepare a scheduled student assessment
  status: approved
  owner: team-assessment
  visibility: customer
  audiences:
  - teacher
  revision: 1
  reviewedBy: team-assessment
  reviewedAt: '2026-10-11'
  links:
    explains:
    - BEH-ASMT-SCHEDULE
    - RULE-ASMT-FUTURE
    - RULE-ASMT-AUTH
  availability:
    products:
    - PRD-LANTERN
    releases:
    - pilot-1
    roles:
    - teacher
    editions:
    - standard
    flags: []
  tips:
    BEH-ASMT-SCHEDULE: Pick a published assessment, a class you manage and a future release time.
    RULE-ASMT-FUTURE: The release time must be in the future.
  extensions:
    intentset.org/review:
      hash: content-v1
      sources:
        BEH-ASMT-SCHEDULE: '4fede99f81c782d216d698ad8d7785ee56f65ac5de0754c77c8269188a2617f4'
        RULE-ASMT-AUTH: d241506c14c5347535248974217d10661d9f006a8f706e8a41428c1fef7afc10
        RULE-ASMT-FUTURE: a89cf09ddc011a8b0d4cd9548af70cd095fd3042d5324e77a7dca01797e07d3f
---

# Prepare a scheduled student assessment

## Guidance

Choose a published assessment, a class you can manage, and a future release time. Review the schedule before confirming. If scheduling is rejected, check your class permissions, publication state, and chosen time.
