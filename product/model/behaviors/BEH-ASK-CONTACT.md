---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-ASK-CONTACT
  type: behavior
  title: A visitor who wants to get in touch is pointed to the way in
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-ASK
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [visitor]
    editions: [hosted]
    flags: []
---

# A visitor who wants to get in touch is pointed to the way in

## Behavior

When a question asks how to contact the team, or offers to work with, fund or talk to the people behind Intentset, the chat answers with a link to coralreefventures.com/get-involved/, where Coral Reef Ventures takes those requests, and says it cannot pass messages on itself.

## Preconditions

A question that reads as a request to make contact.

## Outcomes

Success: the link to the get-involved page. Failure: none to handle; the chat never collects contact details itself, and any it is given are scrubbed before the question is stored.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
