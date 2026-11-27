---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/knowledge/0.4
  id: KB-RESET-PASSWORD
  type: knowledge
  title: Reset your password
  status: approved
  approval:
    at: "2026-11-26"
    basis: direct
    by: "team-support"
  reviewedBy: "team-support"
  reviewedAt: "2026-11-27"
  owner: team-support
  visibility: customer
  audiences:
  - customer
  revision: 1
  links:
    explains:
    - BEH-RESET-PASSWORD
    - RULE-RESET-LINK-EXPIRY
    - RULE-RESET-LINK-ONCE
  availability:
    products:
    - PRD-SHOP
    releases:
    - v1
    roles:
    - customer
    editions:
    - standard
    flags: []
  tips:
    BEH-RESET-PASSWORD: We'll email you a link to choose a new password.
    RULE-RESET-LINK-EXPIRY: The link works for one hour.
  review:
    sources:
      BEH-RESET-PASSWORD: "f6e7a3814effd6599dbb8e2c3ca98c512fc03ddd6ec31e5e9c4b617cff51f026"
      RULE-RESET-LINK-EXPIRY: "3b8c95a05ce75e8879ce2e2d718eb26ea9ec380072c8427070adef536c19bbc6"
      RULE-RESET-LINK-ONCE: "8ca58b2f5389df4bc3983ed0af894823142b80e3041e73168e40ca07b3820a81"
    self: "317398bc3a224b10e0c5dda76974004e9b3a19af74b489b433cfd586cd8f7847"
    gates: "b1a24c66550ce2d8df5966d2d7ab96e919972c5e8f7be51e4e7562d3bb075da7"
---

# Reset your password

## Guidance

Choose Forgot password, enter your email address, and open the link we send you to choose a new password. The link works for one hour and only once. If it has expired, ask for a new one.
