---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-ATLAS-OUTLINE
  type: behavior
  title: The Atlas opens on the product as a tree, and says what each page is for
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
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

# The Atlas opens on the product as a tree, and says what each page is for

## Behavior

The Atlas's landing page, Product, titled "Your product, as a tree", says in two lines what the Atlas is (the records as linked pages, built from the files on this machine) and names each other page with the question it answers, then gives the totals: records, behaviors, those with an owning slice, named by a verification, built and planned, with a current pass when evidence is supplied, and errors, each naming its denominator. Then the tree, the hierarchy a person reads the model in: each product, then its intents and outcomes with each outcome's measures, as headings, then each capability as a fold that starts closed, holding its behaviors. Beneath each behavior are its rules, scenarios, owning slice, verifications and knowledge, each linked to its page and each with its state: a claim is verified, failing, stale, missing a run, not linked, or not assessed when no run evidence was supplied, and knowledge is current or held for review. Each level says its status and how many behaviors are beneath it, with an owning slice, named by a verification and, with evidence, verified, each count naming what it counts. A capability's fold title says how many behaviors it holds, so a product with forty capabilities is forty closed lines. Behaviors outside any capability are listed after the tree.

## Preconditions

A validated graph; run evidence for anything to read as verified.

## Outcomes

Success: the product page, first in the navigation; there is no separate overview. Failure: none of its own; a claim with no evidence reads as not assessed, never as verified.

## Sources

- intentset/intentset#159, the Atlas's hierarchy and usability at product scale.
