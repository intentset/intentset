---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-APPROVAL-BASIS
  type: behavior
  title: A record says who approved it, when, and on what basis
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

# A record says who approved it, when, and on what basis

## Behavior

Someone, or a tool that runs an approval workflow, writes `approval` on a record of any type: `at`, when it was approved, and `basis`, which is `direct` when a person read the record, `derived` when a named source that a person approved covers it, or `attested` when an agent attested it and no person approved it or a source (Core §7, ADR 0020). `by` names the person, for a direct or a derived approval; `source` names what a derived approval rests on, by `ref` and the `revision` or `digest` that was approved; `attestedBy` names the agent, for an attested approval and optionally for a derived one. `validate` checks that shape and nothing else. The content hash leaves `approval` out, so writing or changing it never makes a `content-v1` knowledge review need review, while the whole-file hash moves as for any edit. The export carries it on every artifact, null where a record states none, and `intentset context`, the MCP server's context tools and the Atlas show it.

## Preconditions

None beyond a record. `approval` is optional, on an approved record too, and a record without it says nothing about how it was approved.

## Outcomes

Success: a reader of the records, the export or the context can tell a record a person read from one derived from something a person approved and from one an agent attested. Failure: a block that is not a mapping, an unknown key, a missing `at` or `basis`, another basis, an empty value, a derived approval with no person, no source, or a source with no `ref` or with neither a revision nor a digest, a source or an agent on a direct approval, and a person, a source or no agent on an attested one are each CORE001, with a pointer to the member; the record stays in the graph without the approval. Validation never resolves `ref`, never decides who may approve or whether a person is required, and never compares the block with `status`.

## Sources

- `spec/core-0.3.md` §7, `spec/publication.md` §3 and `spec/export.md` §2, and ADR 0020.
