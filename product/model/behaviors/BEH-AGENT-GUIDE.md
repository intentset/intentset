---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-AGENT-GUIDE
  type: behavior
  title: Init writes a configuration and the agent guide, and overwrites nothing
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-AGENT-CONTEXT
  links:
    governedBy: [RULE-NEVER-REWRITE]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Init writes a configuration and the agent guide, and overwrites nothing

## Behavior

Someone runs `intentset init`. It writes `.intentset/config.yaml`, an empty registry and `.intentset/agents.md`, the guide that tells coding agents how to keep the model current, and prints the one line to add to the file the agents read. `--agents` writes only the guide; `guide` prints it without writing.

## Preconditions

A repository root.

## Outcomes

Success: the files are written and the command says what to do next. Failure: when any of them already exists, init names it, overwrites none of them and exits non-zero.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
