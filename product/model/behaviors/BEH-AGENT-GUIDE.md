---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-AGENT-GUIDE
  type: behavior
  title: Init writes a configuration and the agent guide, and overwrites nothing
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 9
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

Someone runs `intentset init`. It writes `.intentset/config.yaml`; a registry with every list empty and a comment on each saying what it holds, with an example, and that a behavior needs a release, a role and an edition to name; and `.intentset/agents.md`, the guide that tells coding agents how to keep the model current, and prints the one line to add to the file the agents read. The guide carries a template for a behavior, for a slice with every key a slice must carry, written with `layers: {}` and `usesResources: []` and the instruction never to invent a layer the code does not have (VSA §3), with a layer's name taken from the repository's profile, `.intentset/profile.yaml` when it has one (profile contract §2), for a verification bound to a test by its file and a selector its title holds, for a knowledge record's tips and for a measure, says that a capability sits under an outcome, an intent and the product, and names `init --example --root <an empty directory>` as the way to read a small example model, the invented online shop intentset.org tells, whose records `--example` writes under `product/shop/` and whose code and tests it writes under `src/`, so the checks above L1 and the example's own tests run. It tells an agent to write `delivery: built` on a record written from code that exists and `delivery: planned` on a proposal, since delivery states a fact about the code and approves nothing (ADR 0017); to name the outside requirement a behavior, rule or scenario formalizes in `formalizes`; and never to write or change `approval` unless the approval workflow it runs gives it every value, since the block records an approval that happened (ADR 0020); and never to write or change a knowledge record's review, `reviewedBy`, `reviewedAt` or `review` with its pins, `self` and `gates`, unless the review workflow it runs gives it every value, since a hash copied into a pin claims a review nobody made and `intentset approve` is what writes one (Core §10, ADR 0027); and that the articles leading a page, route or panel are `surfaces` on the slice that owns it, with `availability` on that slice, whose surface IDs must never name what some reader may not see, since each is written into every eligible reader's help file once the slice is approved, and that a surface ID holding `:` is written as a quoted YAML key (VSA §3, ADR 0028). It tells an agent never to change the profile file or the architecture configuration so that the architecture check passes, since they are the team's policy. `--agents` writes only the guide; `guide` prints it without writing.

## Preconditions

A repository root.

## Outcomes

Success: the files are written and the command says what to do next. Failure: when any of them already exists, init names it, overwrites none of them and exits non-zero.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
