---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/knowledge/0.3
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
      BEH-RESET-PASSWORD: "6f2d505f458977c491d00421794561e48aead9ca5547a4a4b0a8e364ea0fbc39"
      RULE-RESET-LINK-EXPIRY: "822149299b7bea5da13ea6bc2d8cc6815abe76356fccaa9359255f54adb82b7a"
      RULE-RESET-LINK-ONCE: "5aeb44f6f854bb1853225cfb272f7af0069fc6612b5670486a904f35d49d4a63"
    self: "fbda0d147f8fa8cf5082b7c4b2ddfccebad6d2174a200f99cb677f043cf8fcbb"
    gates: "b1a24c66550ce2d8df5966d2d7ab96e919972c5e8f7be51e4e7562d3bb075da7"
---

# Reset your password

## Guidance

Choose Forgot password, enter your email address, and open the link we send you to choose a new password. The link works for one hour and only once. If it has expired, ask for a new one.
