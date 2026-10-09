---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ASK-NOT-IN-DOCS
  type: behavior
  title: The chat says when the documentation does not answer
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ASK
  links:
    governedBy: [RULE-ASK-PUBLISHED-ONLY]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [visitor]
    editions: [hosted]
    flags: []
---

# The chat says when the documentation does not answer

## Behavior

When nothing in the corpus answers a question, the chat says so plainly and links the page closest to the question, instead of answering from general knowledge.

## Preconditions

A question the corpus does not answer.

## Outcomes

Success: the visitor knows the documentation does not cover it and where to read on. Failure: none to handle; this is the response to a gap. The question is kept with the outcome "not answered", which is how gaps are found.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
