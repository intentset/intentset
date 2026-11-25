---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-REVIEW-APPROVALS
  type: behavior
  title: Review lists records whose status or approval changed
  status: approved
  approval:
    at: "2026-11-25"
    basis: direct
    by: "Gary Clarke"
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-AGENT-CONTEXT
  links:
    governedBy: [RULE-READ-ONLY-CHECKS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Review lists records whose status or approval changed

## Behavior

Someone runs `intentset review --base <ref>`. Under "Approvals and status changes" the report lists every changed record whose `status` or `approval` differs from the base's copy, and every new record that arrives past draft or with an approval: its ID and type, the status at the base and now, and the approval it now states. A record that moved is compared with the file it was at the base. The JSON output carries the same rows as `statusChanges`.

## Preconditions

A git repository and a base ref.

## Outcomes

Success: the section, with a count; "None." when no record qualifies. A record changed in any other way is not listed. Failure: none of its own; the list never changes the exit code, because who may approve is the repository's workflow. With no base, the section says nothing was compared.

## Sources

- Core §10; ADR 0022 in `docs/decisions/`; the CLI's usage, `intentset --help`.
