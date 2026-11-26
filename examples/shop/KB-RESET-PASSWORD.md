---
markset: true
intentset:
  spec: '0.2'
  profile: intentset/knowledge/0.2
  id: KB-RESET-PASSWORD
  type: knowledge
  title: Reset your password
  status: approved
  approval:
    at: "2026-11-26"
    basis: direct
    by: "team-support"
  reviewedBy: "team-support"
  reviewedAt: "2026-11-26"
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
  extensions:
    intentset.org/review:
      hash: content-v1
      sources:
        BEH-RESET-PASSWORD: "80e840df2fb8efec562844307b91812fad41d73165d339798a4467d8a26a5c6c"
        RULE-RESET-LINK-EXPIRY: "a1b86a4be46c9ae86d8cdb934d0192bd7eda3935ec754b284a85ce1b5fe4d217"
        RULE-RESET-LINK-ONCE: "66f1862da5c03923715c2091caa24bf32c87af1b41464955678537d540884126"
---

# Reset your password

## Guidance

Choose Forgot password, enter your email address, and open the link we send you to choose a new password. The link works for one hour and only once. If it has expired, ask for a new one.
