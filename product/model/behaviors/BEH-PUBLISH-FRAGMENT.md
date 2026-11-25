---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-PUBLISH-FRAGMENT
  type: behavior
  title: Publication renders a document as an HTML fragment
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
    - source: https://github.com/intentset/intentset/issues/146
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Publication renders a document as an HTML fragment

## Behavior

Someone publishing asks for each document's HTML as a fragment, with `renderHtml: "fragment"` or `intentset publish --html=fragment`, for a product that shows the article inside its own interface, and gets the document's content as the page would hold it, without the page around it (publication §2).

## Preconditions

A publication request that is accepted, and documents that it publishes.

## Outcomes

Success: each published document carries `htmlFragment`, and the CLI writes it as `<ID>.fragment.html`. The fragment is the page's content, rendered and sanitized as the page is, so no raw HTML from the source passes through; it leaves out the title heading, the first level-one heading at the top of the body, and keeps every other heading with the id it has in the page; it holds no stylesheet, no `<html>`, `<head>` or `<body>`, and no provenance, which stays on the document's `publication`. The same inputs give the same bytes. `"page"` and `true` still give the complete page, byte for byte as before, and nothing else; `"fragment"` gives the fragment and no page. Failure: a rendering other than a page or a fragment is refused, by the publisher with an error and by the CLI with a usage message, and nothing is written; a refused request or an excluded document has no fragment, as it has no page.

## Sources

- Issue #146, spec/publication.md §2, and `intentset --help`.
