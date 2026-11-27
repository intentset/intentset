---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-MCP-CONTEXT
  type: behavior
  title: The MCP server gives agents the model read-only
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
  parent: CAP-REVIEW-VIEWS
  links:
    governedBy: [RULE-READ-ONLY-CHECKS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# The MCP server gives agents the model read-only

## Behavior

An agent connects to `intentset mcp` on stdio. In engineering mode it looks up, searches and reads the context and impact of the model's artifacts, each with its `sourceHash` and `contentHash`, the basis of its approval and the outside requirements it formalizes (ADR 0020); in customer mode it searches and reads one publication made in memory as `publish` makes it, and nothing else.

## Preconditions

A configured repository; for customer mode, the publication request.

## Outcomes

Success: the answers. Failure: the server writes nothing, and a customer-mode server never answers with what that publication would not include.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
