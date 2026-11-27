---
markset: 0
intentset:
  spec: '0.4'
  profile: intentset/behavior/0.4
  id: BEH-HELP-SURFACES
  type: behavior
  title: A page lists the knowledge that leads it first
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: CAP-PUBLISH
  links:
    governedBy: [RULE-FAIL-CLOSED]
  formalizes:
    - source: https://github.com/intentset/intentset/issues/143
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# A page lists the knowledge that leads it first

## Behavior

A product reads a help file with `@intentset/help` and asks for a surface's help. `readHelp` requires `surfaces` and refuses the whole file when it is not an object, when a key breaks VSA §3's rules, when an entry has any member besides `knowledge`, or when `knowledge` is empty, repeats an ID or names an article the file does not list. `leadFor(help, surface, options?)` returns the surface's articles in order, `[]` for a surface the file does not list; `surfaceHelp` returns them with `pendingReview`, so a caller can tell a surface whose leads are all under review from one the file does not list. `helpForPage(help, ids, { surface })` returns `surface`, `lead`, and `knowledge` with the lead first, then the articles tips reach that are not in the lead, and `leadPendingReview`. Under the default `underReviewHelp: "exclude"` a lead under review is left out and named in `leadPendingReview`; under `include` it is returned marked.

## Preconditions

A help file published at `intentset/help/0.3`.

## Outcomes

Success: a page lists its lead articles first, in order, and each article once. Failure: a file whose surfaces break a rule is refused whole and every problem named; an unknown surface, `__proto__` or `constructor` among them, has no lead.
