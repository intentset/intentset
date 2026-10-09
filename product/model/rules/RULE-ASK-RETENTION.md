---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-ASK-RETENTION
  type: rule
  title: Questions are kept for 90 days
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# Questions are kept for 90 days

## Constraint

A stored question and its answer are deleted 90 days after they were asked. Before a question is stored, email addresses, phone numbers and strings that look like keys or tokens are replaced; the scrubbing is best-effort. The privacy page states the same period, from the same constant.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
