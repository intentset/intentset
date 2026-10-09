---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-ASK-SPEND-CAPPED
  type: rule
  title: The chat's spend has a ceiling
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
---

# The chat's spend has a ceiling

## Constraint

A visitor may ask a limited number of questions a day, a question and a conversation have a maximum length, the chat stops answering for the day once its daily budget is spent, and the function has reserved concurrency, so the chat cannot take capacity other functions in the project need. A switch turns the chat off without a deploy.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
