---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ASK-ANSWER
  type: behavior
  title: The chat answers a question from the documentation, with its sources
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ASK
  links:
    governedBy: [RULE-ASK-PUBLISHED-ONLY, RULE-ASK-SPEND-CAPPED]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [visitor]
    editions: [hosted]
    flags: []
---

# The chat answers a question from the documentation, with its sources

## Behavior

A visitor types a question in the chat panel. The answer streams back as it is written, and each claim links to the page, or the section of a specification, it came from. A follow-up question in the same conversation is answered with the conversation so far.

## Preconditions

The chat is on, and the visitor is inside the day's limits.

## Outcomes

Success: the answer and its links. Failure: when the model or the network fails, the panel says the answer could not be finished and links the documentation's start page; nothing partial is presented as complete.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
