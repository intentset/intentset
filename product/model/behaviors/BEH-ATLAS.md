---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ATLAS
  type: behavior
  title: Atlas renders review pages over an export
  status: approved
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 5
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

Someone runs `intentset serve` and gets the Atlas, the internal review pages over the model's export, served locally and rebuilt when a file changes, or written to `--out`: the model, its reports and each artifact, with the snapshot each page describes. Every record has a page of its own, listed by type on the Records page, and every ID on the other pages and the map links to it. A record's page says where it sits, among the records and in the model, and keeps Records marked in the navigation. Then comes the record, in one card that holds nothing else: its file's path, linked to the file where a source address is given, every field of its frontmatter, and its text, rendered as written with its links kept only where they are safe. Everything after the card is what the Atlas derives, and the page says so: a behavior's context bundle, claims and evidence, and for any other record the links other records write to it. Text that does not parse as Markset is shown as written, and the page says so. Every page opens with a notice that it may hold internal and restricted records and is not for publication. The one exception is an invented example's Atlas, asked for from the library with the `example` notice: its pages say the product is invented and that a team's own Atlas stays internal, which is how intentset.org shows the worked example's. The overview's chart of behaviors by capability stays readable at any number of capabilities: each capability has a row tall enough for its label and its bars, the labels are whole (a very long one is cut in the middle, so two that start alike still differ), and the figure grows in height rather than squeezing its rows; the table under it carries every value.

## Preconditions

A configured repository; run records for the evidence pages.

## Outcomes

Success: the pages. Failure: an invocation the command cannot run exits 2 and serves nothing.

## Sources

- The CLI's usage, `intentset --help`, and `CLAUDE.md`, the Core API.
