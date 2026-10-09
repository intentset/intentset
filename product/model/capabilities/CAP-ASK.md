---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/capability/0.1
  id: CAP-ASK
  type: capability
  title: Ask the documentation a question
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: OUT-QUESTIONS-ANSWERED
---

# Ask the documentation a question

## Overview

A visitor to intentset.org asks a question in a panel beside the page they are reading, and gets an answer streamed back, drawn only from the published specifications, the site's pages and reviewed knowledge, with each claim linked to its source. The answer comes from Claude Opus 5.5 on Amazon Bedrock, called by a function behind an API Gateway API and a web application firewall in the coral-reef AWS project. The documentation works the same without the panel.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
