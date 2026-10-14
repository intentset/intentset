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
      sources:
        BEH-ASMT-SCHEDULE: '881ee15087db5799a213a190aaaccb4aeb730086c0784b46e75fe0420ac3f873'
        RULE-ASMT-AUTH: '63236d9939055a4d5e9eca1d8133ed5645eed2c00098cbbfcc4192916cedf094'
        RULE-ASMT-FUTURE: '9b3666830eaec17681f8725125bfeb588c53a38f3ebad710f19427ecd07db05e'
---

# Prepare a scheduled student assessment

## Guidance

Choose a published assessment, a class you can manage, and a future release time. Review the schedule before confirming. If scheduling is rejected, check your class permissions, publication state, and chosen time.
