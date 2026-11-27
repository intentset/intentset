---
markset: 0
intentset:
  spec: '0.4'
  profile: intentset/knowledge/0.4
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
  review:
    hash: content-v1
    sources:
      BEH-ASMT-SCHEDULE: '1437fa81be5a7ad08abc356672089796329cd5a5274680aa2e41b8372f16fc14'
      RULE-ASMT-AUTH: '05ad205fe050e7065ec2cac56021d53e5c51eedddced655105d3285e34ef51e7'
      RULE-ASMT-FUTURE: '267c13cb402e345ddf97bb9f7319ec5de4135c213fc557ed89577740a8eacbfd'
---

# Prepare a scheduled student assessment

## Guidance

Choose a published assessment, a class you can manage, and a future release time. Review the schedule before confirming. If scheduling is rejected, check your class permissions, publication state, and chosen time.
