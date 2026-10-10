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
  revision: 3
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

A visitor types a question in the chat panel. The answer streams back as it is written, with its headings, lists, tables and code drawn as such, and each claim links to the page, or the section of a specification, it came from. A follow-up question in the same conversation is answered with the conversation so far. The panel can be expanded to fill the window, and stays expanded from page to page until restored; reopened on a new page, it does not take the page's focus.

## Preconditions

The chat is on, and the visitor is inside the day's limits.

## Outcomes

Success: the answer and its links. Failure: when the model or the network fails, the panel says the answer could not be finished and links the documentation's start page; nothing partial is presented as complete. A model or store that stalls is given up on within seconds, and the panel stops waiting after a minute with nothing from the chat, so a visitor is never left waiting on an answer that is not coming; starting a new conversation abandons one still being written.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
