---
markset: true
intentset:
  spec: '0.2'
  profile: intentset/behavior/0.2
  id: BEH-ATLAS-OUTLINE
  type: behavior
  title: The Atlas opens on the model as an outline
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
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

# The Atlas opens on the model as an outline

## Behavior

The Atlas's landing page is an outline of the model, the hierarchy a person reads it in: each product, then its intents and outcomes with each outcome's measures, as headings, then each capability as a fold that starts closed, holding its behaviors. Beneath each behavior are its rules, scenarios, owning slice, verifications and knowledge, each linked to its page and each with its state: a claim is verified, failing, stale, missing a run, not linked, or not assessed when no run evidence was supplied, and knowledge is current or held for review. Each level says its status and how many behaviors are beneath it, with an owning slice, named by a verification and, with evidence, verified, each count naming what it counts. A capability's fold title says how many behaviors it holds, so a product with forty capabilities is forty closed lines. Behaviors outside any capability are listed after the tree.

## Preconditions

A validated graph; run evidence for anything to read as verified.

## Outcomes

Success: the outline, before the overview in the navigation. Failure: none of its own; a claim with no evidence reads as not assessed, never as verified.

## Sources

- intentset/intentset#159, the Atlas's hierarchy and usability at product scale.
