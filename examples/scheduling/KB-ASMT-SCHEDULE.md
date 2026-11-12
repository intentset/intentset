---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/knowledge/0.2
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
        BEH-ASMT-SCHEDULE: '6d6d30d8dc134427566aad8f240ff93a6d4c0f844b6fc26657f69d0e861bd1c7'
        RULE-ASMT-AUTH: '949105cd53a1490858a81513dd98f8aee815c4552721627e1345cc636b8d45bb'
        RULE-ASMT-FUTURE: daea07d3681b6369a65ad7c23b88b52633ec126d5be48af1e68c610df22773ed
---

# Prepare a scheduled student assessment

## Guidance

Choose a published assessment, a class you can manage, and a future release time. Review the schedule before confirming. If scheduling is rejected, check your class permissions, publication state, and chosen time.
