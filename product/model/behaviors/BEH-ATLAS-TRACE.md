---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-ATLAS-TRACE
  type: behavior
  title: A behavior's page traces it from why it exists to what people are told
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-REVIEW-VIEWS
  links:
    governedBy: [RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A behavior's page traces it from why it exists to what people are told

## Behavior

A behavior's page opens what the Atlas derives with its trace, six steps in order: why (the intents and outcomes above it and their measures), the behavior with its status, delivery and state, its rules and scenarios with theirs, its owning slice with the decisions that inform it, its verifications with their evidence, and the knowledge that explains it with its review. Each record in a step links its page. An empty step says what is missing, such as no owning slice, rather than disappearing.

## Preconditions

A validated graph.

## Outcomes

Success: the trace, before the context bundle. Failure: none of its own; a missing step is stated, not hidden.

## Sources

- intentset/intentset#159, the Atlas's hierarchy and usability at product scale.
