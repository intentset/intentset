---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-ASK-NO-IDENTITY
  type: rule
  title: Nothing kept identifies a visitor
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# Nothing kept identifies a visitor

## Constraint

The chat stores no IP address, user agent, location or cookie. The per-visitor limit counts a salted hash of the IP address, kept for 24 hours. A conversation's id is made in the browser for that conversation and is not kept between visits. Logs carry an event kind, ids, a status and token counts, never a question or an answer.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
