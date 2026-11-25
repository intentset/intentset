---
markset: 0
intentset:
  spec: '0.2'
  profile: intentset/verification/0.2
  id: TEST-HELP-WATCH
  type: verification
  title: Watching rebinds once per frame and dispose undoes every binding
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  links:
    verifies: [BEH-HELP-WATCH]
  verification:
    method: automated
    locator: packages/help/test/help.test.ts
    selector: BEH-HELP-WATCH
---

# Watching rebinds once per frame and dispose undoes every binding

## Procedure

`pnpm test` runs these tests with node:test. They watch a stub root that answers querySelectorAll, with a stub `MutationObserver` the test fires by hand and a frame scheduler it advances by hand, so no DOM is needed. The selector is the behavior's ID, which each test's title carries; `pnpm run model:evidence` reruns the tests with the TAP reporter and turns the result into run records.

- `packages/help/test/help.test.ts`: the test "watchTips binds at once, observes only its root, and rebinds once per frame however many changes"
- `packages/help/test/help.test.ts`: the test "watchTips renders each element once, unrenders one that changes behavior or leaves the root"
- `packages/help/test/help.test.ts`: the test "dispose stops watching, cancels a pending pass and leaves the DOM as it found it"
- `packages/help/test/help.test.ts`: the test "watchTips without a MutationObserver or a frame scheduler says which it needs"

## Expected result

Every test whose title carries `BEH-HELP-WATCH` passes. The root alone is observed; several changes before a frame make one pass; an element bound to the same tip is not rendered again, and one that changed behavior or left the root is unrendered; `dispose` disconnects the observer, cancels the pending pass and leaves every element's attributes as they were before; a missing observer or scheduler is named.
