---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-AGENT-GUIDE
  type: behavior
  title: Init writes a configuration and the agent guide, and overwrites nothing
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
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

Someone runs `intentset init`. It writes `.intentset/config.yaml`; a registry with every list empty and a comment on each saying what it holds, with an example, and that a behavior needs a release, a role and an edition to name; and `.intentset/agents.md`, the guide that tells coding agents how to keep the model current, and prints the one line to add to the file the agents read. The guide carries a template for a behavior, for a verification bound to a test by its file and a selector its title holds, for a knowledge record's tips and for a measure, says that a capability sits under an outcome, an intent and the product, and names `init --example --root <an empty directory>` as the way to read one record of each type. It tells an agent to write `delivery: built` on a record written from code that exists and `delivery: planned` on a proposal, since delivery states a fact about the code and approves nothing (ADR 0017). `--agents` writes only the guide; `guide` prints it without writing.

## Preconditions

A repository root.

## Outcomes

Success: the files are written and the command says what to do next. Failure: when any of them already exists, init names it, overwrites none of them and exits non-zero.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
