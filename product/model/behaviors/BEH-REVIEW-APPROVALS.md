---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-REVIEW-APPROVALS
  type: behavior
  title: Review lists records whose status or approval changed
  status: draft
  approval:
    at: "2026-11-25"
    basis: direct
    by: "Gary Clarke"
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 3
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

Someone runs `intentset review --base <ref>`. Under "Approvals, reviews and status changes" the report lists every changed record whose `status` or `approval` differs from the base's copy, every new record that arrives past draft or with an approval, and every knowledge record whose `reviewedBy`, `reviewedAt` or `review` differs from the base's copy, or that arrives with a review (ADR 0027): its ID and type, the status at the base and now, the approval it now states, and, for a review, the reviewer and date it now names. A record that moved is compared with the file it was at the base, and a base copy that declares an earlier `spec` is compared as `intentset migrate` would move it, in memory, so a change that migrates records lists only those whose status, approval or review it also changed. A review pin is not a change of review only when it is exactly what the move re-pins: the move rewrites that knowledge record's pins at all (it moves the record, or the record is already at `0.3`), the pin is of the kind the record's own version read (a `0.2` review naming `hash: file-v1` is not), the base pin matched the pinned record's base copy, the head pin is the same kind of hash of that copy as migrated, and the pinned record's head hash is that value. A branch that migrates, edits a source and copies its new hash into a pin is listed. The JSON output carries the same rows as `statusChanges`.

## Preconditions

A git repository and a base ref.

## Outcomes

Success: the section, with a count; "None." when no record qualifies. A record changed in any other way is not listed. Failure: none of its own; the list never changes the exit code, because who may approve is the repository's workflow. With no base, the section says nothing was compared.

## Sources

- Core §10; ADR 0022 and ADR 0027 in `docs/decisions/`; the CLI's usage, `intentset --help`.
