---
markset: 0
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-PUBLISH-SURFACES
  type: behavior
  title: The help file maps each surface to the articles published for its reader
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
    - source: https://github.com/intentset/intentset/issues/143
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# The help file maps each surface to the articles published for its reader

## Behavior

Someone publishes. `help.json` carries `surfaces` between `knowledge` and `tips` (publication §5, ADR 0028): by surface ID, keys in code-unit order, the documents published in the run that lead each surface, in the order its slice declares them. A surface is written only when its slice is approved or deprecated, its effective delivery is `built`, it declares `availability` and the request passes it (one of the request's roles suffices), no other slice that is not retired declares the same ID, it is not restricted unless the request is authorized for restricted data, its key holds no ID of an artifact the projection does not admit (the requested product aside) and no path of a record not published, as whole path segments wherever they stand, after a route's `/` included, and at least one of its leads has a document in the run, one kept under review included. The key is written whatever the slice's visibility below restricted, and nothing else of the slice is. `PublishResult.omittedSurfaces` names, by slice ID and reason, each slice the projection admits whose surfaces were left out, and `intentset publish` prints them after the files it wrote; neither the index, the help file, a document nor a chunk carries them.

## Preconditions

A publication request the publisher accepts, and a graph whose slices may declare `surfaces`.

## Outcomes

Success: each eligible surface is written with its published leads, `{}` when none is, with the same bytes for the same inputs; a change to surfaces alone moves `help.json` and no document, chunk or index. Failure: a surface whose slice fails a condition, or whose leads were all left out, is absent, never written empty; a surface two slices declare is written from neither; a slice the projection does not admit is neither named nor counted in the omissions.
