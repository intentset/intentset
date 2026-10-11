---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/knowledge/0.1
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
        BEH-ASMT-SCHEDULE: '1cb64613c917d4adbb85fa8a28898e13d4450b9c2840ee80f66fcba1673fc02e'
        RULE-ASMT-AUTH: '40a217f3c9c56d148e185e99b0c39c61b5ad27abf4cdab70bf4d800ffd404947'
        RULE-ASMT-FUTURE: e39f8756c8783312666924df3f6d2f09ad59cd6982d6ae834ea3e8d95812b35a
---

# Prepare a scheduled student assessment

## Guidance

Choose a published assessment, a class you can manage, and a future release time. Review the schedule before confirming. If scheduling is rejected, check your class permissions, publication state, and chosen time.
