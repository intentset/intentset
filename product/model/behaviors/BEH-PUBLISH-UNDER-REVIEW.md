---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-PUBLISH-UNDER-REVIEW
  type: behavior
  title: Knowledge whose sources changed can be published marked under review, from the text its review covered
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-PUBLISH
  links:
    governedBy: [RULE-FAIL-CLOSED, RULE-DETERMINISTIC]
  formalizes:
    - source: https://github.com/intentset/intentset/issues/142
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Knowledge whose sources changed can be published marked under review, from the text its review covered

## Behavior

Someone publishes with a request that names `keepUnderReview: true`, or runs `intentset publish --keep-under-review`. Knowledge that needs review only because sources it pins changed what they promise, whose review pins its own text in `self` and who could see each source in `gates`, both still matching, is *keepable* (publication §3, ADR 0027). It is published from the repository as it is, after every other check of publication §1 and §4, as a document kept under review: written under `under-review/`, its block carrying `underReview: true` and `changedSinceReview`, its Markset a fixed note after its title, a block of its own so no paragraph runs into it, its page `noindex`, its fragment wrapped in an element marked `data-intentset-under-review`, and a relative link to a current document written with `../`. The index lists it in `keptUnderReview`, never in `published`; `PublishResult` returns it in `keptUnderReview`, never in `documents`; the help file lists it with its `under-review/` path, marked, and marks each of its tips, holding back a tip keyed to a rule in `withheldForReview`. It is never chunked, and the MCP server serves only current documents.

## Preconditions

A request that names `keepUnderReview: true`, and knowledge whose review carries `reviewedBy`, `reviewedAt`, a pin for every source it must pin, a hash kind the publisher reads, and `self` and `gates`, as `intentset approve` writes them.

## Outcomes

Success: keepable knowledge is published, marked, apart from current documents; the request publishes the same current documents, byte for byte, as without `keepUnderReview`, and a run that keeps nothing writes the same bytes but for the index's request; a current tip wins over a kept one whatever the IDs. Failure: without the request field, or when the knowledge's own text changed, a pin is missing or of an unknown kind, no reviewer is named, `self` or `gates` is absent or no longer matches (a source's audiences, visibility or availability changed), or a source is gone or retired, the knowledge is excluded as `needs-review`, and a CORE008 for it names the condition that failed; a `keepUnderReview` that is not a boolean refuses the request (PUB001); a current document that links a kept one is refused, as it is without the field; a kept document §4 refuses is not written.
