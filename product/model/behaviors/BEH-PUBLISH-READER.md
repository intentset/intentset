---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-PUBLISH-READER
  type: behavior
  title: A publication request names every audience and role of one reader
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
    - source: https://github.com/intentset/intentset/issues/144
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A publication request names every audience and role of one reader

## Behavior

Someone publishes for a request whose `audience` and `role` are each one value or a list of every audience and role one reader holds, with `--audience` and `--role` repeated on `intentset publish` and `intentset mcp --mode customer`. Knowledge that lists any of them is published in one run, and every file of the publication, each document's block, `help.json` and the index's request, names the request's audiences, roles and flags as sorted lists: the whole entitlement, held all-of (publication §1, ADR 0029).

## Preconditions

Every value, every member of a list included, is declared in the registries, and the reader holds every one of them: publication does not authenticate the request.

## Outcomes

Success: any order or repetition of the lists writes the same bytes, and a value alone is the same request as a list of one, to the publisher's exported `exclusionReason`, `audienceReason`, `availabilityReason`, `indexedRequest`, `publicationMeta`, `keptPublicationMeta`, `generateDocument` and `helpFile` too, which never read a string as its characters; a document that links one admitted only by another of the request's roles is published; every document, the help file and the index name the same entitlement; the index names its profile first, and its request, with authorization added back, publishes the same bytes again. Failure: an empty, malformed or unknown member, or a list in product, release or edition, refuses the whole request (PUB001) and writes no document or help file; a CORE008 for an audience or role names only the request's values; a title in a body is allowed only by a document still published in the run, so a candidate refused for any reason lends its title to no other (PUB002).
