---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-FORMALIZES
  type: behavior
  title: A behavior, rule or scenario names the outside requirement it formalizes
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-VALIDATE
  links:
    governedBy: [RULE-READ-ONLY-CHECKS, RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A behavior, rule or scenario names the outside requirement it formalizes

## Behavior

Someone, or a tool, writes `formalizes` on a behavior, rule or scenario: a list of entries, each a `source`, a URL or a tool's key for a requirement outside the model such as a work tracker's item, and optionally an `anchor` for the part of it that is meant, such as one acceptance criterion (Core §5, ADR 0020). `validate` checks that the reference is well formed and never resolves it: it makes no edge, fetches nothing and judges nothing about the source. The content hash leaves `formalizes` out, since it says where a promise came from and not what it is, so naming the requirement, or a tool renumbering its criteria, leaves a `content-v1` knowledge review current. The export carries the entries on every artifact, sorted by source and anchor and empty where a record names none, and `intentset context`, the MCP server's context tools and the Atlas show them.

## Preconditions

A behavior, rule or scenario. `formalizes` on any other type is CORE001.

## Outcomes

Success: a record states which outside requirement it formalizes, in a place every tool reads the same way. Failure: a value that is not a list, an empty list, an entry that is not a mapping, a missing or empty `source`, an empty `anchor`, an unknown key and an entry that repeats another's source and anchor are each CORE001, with a pointer to the entry; the well-formed entries are kept. A source that does not exist validates, because no check uses the network.

## Sources

- `spec/core-0.4.md` §5, `spec/publication.md` §3 and `spec/export.md` §2, and ADR 0020.
