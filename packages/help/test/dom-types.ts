/**
 * A type-level test, run by `pnpm run typecheck` and never executed: the
 * browser's own APIs are accepted by `watchTips`'s options under lib dom. A
 * change to `TipObserver` or `WatchOptions` that rejects them fails the
 * typecheck. Not named `*.test.ts`, so node --test does not load it.
 */
import { type Help, watchTips } from "../src/index.ts";

export function domTypes(help: Help): void {
  // The DOM's MutationObserver, whose observe takes a Node, for an element, a document and a shadow root.
  watchTips(document.body, help, { MutationObserver });
  watchTips(document, help, { MutationObserver });
  const shadow = document.createElement("div").attachShadow({ mode: "open" });
  watchTips(shadow, help, { MutationObserver: globalThis.MutationObserver });

  // requestAnimationFrame and cancelAnimationFrame, whose handle is a number.
  watchTips(document.body, help, {
    MutationObserver,
    requestFrame: requestAnimationFrame,
    cancelFrame: cancelAnimationFrame,
  });

  // setTimeout and clearTimeout, whose handle is whatever the host's timers return.
  watchTips(document.body, help, {
    MutationObserver,
    requestFrame: (callback) => setTimeout(callback, 16),
    cancelFrame: clearTimeout,
  });
}
