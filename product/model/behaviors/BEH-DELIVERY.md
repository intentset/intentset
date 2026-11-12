---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-DELIVERY
  type: behavior
  title: A record says whether its work is built, apart from its approval
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-VALIDATE
  links:
    governedBy: [RULE-FAIL-CLOSED, RULE-UNRESOLVED-NOT-PASS]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A record says whether its work is built, apart from its approval

## Behavior

Someone, or an agent, writes `delivery: built` on a capability, behavior, rule, scenario, slice or contract that describes code that exists, or `delivery: planned` on one that proposes work (Core §7, ADR 0017). Validation reads it beside the status: a record's effective delivery is the field, or `built` when its status claims an implementation, or not stated. `validate` reports a record that says planned while its status claims an implementation, and a built behavior whose slice says planned; at L2 it warns about a draft behavior that says built and that no product slice owns, and the architecture check holds a built slice's paths to what exists. `intentset list --delivery` selects by the effective delivery, the export carries the field as written, the Atlas shows it beside the status, and publication leaves out knowledge that explains planned work.

## Preconditions

A record of a type that carries delivery. `delivery` on any other type is CORE001, as is a value other than planned or built.

## Outcomes

Success: a draft written from existing code is told apart from a proposal, in the records, in `list`, in the export and in the Atlas, without anyone approving it. Failure: a contradiction is CORE005; a built slice's missing claim or entrypoint is VSA009 or VSA002, an error though the slice is draft; and knowledge that explains planned work is excluded from publication with the reason `planned`. A record that states no delivery is never read as built unless its status claims an implementation.

## Sources

- `spec/core-0.2.md` §7, VSA §3, `spec/publication.md` §1, `spec/list.md` §1 and `spec/export.md` §2, and ADR 0017.
