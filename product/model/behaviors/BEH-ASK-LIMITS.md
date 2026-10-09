---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ASK-LIMITS
  type: behavior
  title: The chat refuses, politely, past its limits
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ASK
  links:
    governedBy: [RULE-ASK-SPEND-CAPPED]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [visitor]
    editions: [hosted]
    flags: []
---

# The chat refuses, politely, past its limits

## Behavior

A question over the maximum length, a conversation over the maximum number of turns, a visitor past the day's limit, or any question once the day's budget is spent or the chat is switched off, is refused with a sentence saying which, and a link to the documentation.

## Preconditions

Any one of the limits is reached.

## Outcomes

Success: none; this is the response to a limit. Failure: the refusal costs no model call, and the question is not stored.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
