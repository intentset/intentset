---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-QUESTIONS-REPORT
  type: behavior
  title: Maintainers get a report of what visitors asked
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-LEARN-FROM-QUESTIONS
  links:
    governedBy: [RULE-ASK-NO-IDENTITY]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [maintainer]
    editions: [hosted]
    flags: []
---

# Maintainers get a report of what visitors asked

## Behavior

A maintainer runs the questions report, which groups the stored questions by topic, lists those the documentation did not answer and those asking to make contact, and counts each outcome.

## Preconditions

AWS credentials that can read the questions table.

## Outcomes

Success: the report. Failure: without access the report says so and reads nothing.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
