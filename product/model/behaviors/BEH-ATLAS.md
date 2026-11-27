---
markset: true
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-ATLAS
  type: behavior
  title: Atlas renders review pages over an export
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 10
  parent: CAP-REVIEW-VIEWS
  links:
    governedBy: [RULE-DETERMINISTIC]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Atlas renders review pages over an export

## Behavior

Someone runs `intentset serve` and gets the Atlas, the internal review pages over the model's export, served locally and rebuilt when a file changes, or written to `--out`: the model, its reports and each artifact, with the snapshot each page describes. Every record has a page of its own, listed by type on the Records page, and every ID on the other pages and the map links to it. A record's page says where it sits, among the records and in the model, and keeps Records marked in the navigation. Then comes the record, in one card that holds nothing else: its file's path, linked to the file where a source address is given, every field of its frontmatter, the basis of its approval and the outside requirements it formalizes among them (ADR 0020), and its text, rendered as written with its links kept only where they are safe. Everything after the card is what the Atlas derives, and the page says so: a behavior's context bundle, claims and evidence, and for any other record the links other records write to it. Text that does not parse as Markset is shown as written, and the page says so. Every page opens with one line saying it is internal and not for publication, and one sentence saying what the page is for. The one exception is an invented example's Atlas, asked for from the library with the `example` notice: its line says the product is invented and that a team's own Atlas stays inside its organization, which is how intentset.org shows the shop's. Every record's page shows a record's delivery, built, planned or not stated, beside its status and never in place of it, and the product page counts the behaviors whose work is built and planned (ADR 0017). A knowledge record's review is current or needs review as publication judges it, with each review's pin kind (ADR 0018), and the page names a kind this version does not read rather than listing every source as changed. It says when a review's own text changed since review, and when knowledge that needs review is keepable, so a request with `keepUnderReview` would publish it marked under review; the publication page counts keepable knowledge beside current knowledge, out of every knowledge artifact (ADR 0027).

## Preconditions

A configured repository; run records for the evidence pages.

## Outcomes

Success: the pages. Failure: an invocation the command cannot run exits 2 and serves nothing.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
