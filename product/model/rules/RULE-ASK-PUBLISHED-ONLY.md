---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/rule/0.1
  id: RULE-ASK-PUBLISHED-ONLY
  type: rule
  title: Answers come only from what is published
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
---

# Answers come only from what is published

## Constraint

The chat answers only from its corpus: the specifications, the site's pages, the agent guide and the worked example as the site publishes them from the same commit, and knowledge records that publication releases to the public audience. A draft, retired or unreviewed record never reaches it. Which knowledge records are released is decided by `intentset publish` itself, never by the site: the corpus carries a knowledge record from Intentset's own model only when a public publication for one of its products and the release dimensions its registries declare releases it, and the site serves a page for each one, so its citation links somewhere real. When the corpus does not answer a question, the chat says so rather than answering from elsewhere.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
