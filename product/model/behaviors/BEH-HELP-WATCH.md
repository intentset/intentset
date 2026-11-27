---
markset: true
intentset:
  spec: '0.3'
  profile: intentset/behavior/0.3
  id: BEH-HELP-WATCH
  type: behavior
  title: Tips stay bound while the interface changes, and unbinding leaves the page as it was
  status: draft
  delivery: built
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-PUBLISH
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [developer]
    editions: [open-source]
    flags: []
---

# Tips stay bound while the interface changes, and unbinding leaves the page as it was

## Behavior

A product's interface calls `watchTips(root, help, { render, unrender, attribute })`. It binds the tips under `root` at once, as `bindTips` does, then again whenever the DOM under `root` changes, batched to one pass per animation frame. An element already bound to the same tip is not rendered again; one whose behavior changed, or that left `root`, is unrendered first. It returns `coverage()`, what the last pass bound and found no tip for, and `dispose()`, which stops observing, cancels a pending pass and calls `unrender` on every element it bound. It takes `underReviewHelp` as `bindTips` does (ADR 0027), and `coverage()` also returns `pendingReview`, each list a copy. With the default render and no `unrender`, it puts `data-help-tip`, `data-help-knowledge` and `data-help-under-review` back as they were before the watch set them; with a product's own `render` and no `unrender`, it undoes nothing. A `dispose` from inside `render` stops the pass, and a first pass that throws unrenders what it rendered before the error reaches the caller.

## Preconditions

A help file read by `readHelp`, a root under which controls are marked `data-behavior="BEH-..."` by default, and a `MutationObserver` and a frame scheduler, the browser's own unless others are given. `cancelAnimationFrame` cancels a pending pass only when the scheduler is the browser's `requestAnimationFrame`; a pass another scheduler cannot cancel runs and does nothing once disposed.

## Outcomes

Success: tips are bound only under `root`, kept bound as the interface changes, and after `dispose` the DOM under `root` is as it was before when the render is the default, or when the product's `unrender` undoes its `render`, so the help can be mounted into another application's page and unmounted from it. Failure: without a `MutationObserver` or a frame scheduler, `watchTips` throws, naming which one it needs, and binds nothing.

## Sources

- Issue #145, ADR 0027, and `packages/help/src/index.ts`.
