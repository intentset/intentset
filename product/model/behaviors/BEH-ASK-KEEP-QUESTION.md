---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ASK-KEEP-QUESTION
  type: behavior
  title: A question and its answer are kept, scrubbed, for 90 days
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-LEARN-FROM-QUESTIONS
  links:
    governedBy: [RULE-ASK-RETENTION, RULE-ASK-NO-IDENTITY]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [visitor]
    editions: [hosted]
    flags: []
---

# A question and its answer are kept, scrubbed, for 90 days

## Behavior

Each answered question is stored with its answer, the sources cited, its outcome (answered, not in the documentation, or failed), the token counts, the model, the corpus version and the time, scrubbed first. The panel says so before the first question and links the privacy page.

## Preconditions

The question was admitted.

## Outcomes

Success: the stored record, deleted after 90 days. Failure: when storing fails, the answer is still given, and the failure is logged without the question.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
