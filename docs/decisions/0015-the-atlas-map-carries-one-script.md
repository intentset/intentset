# ADR 0015: The Atlas's map carries one script, and the picture stands without it

**Status:** accepted, 2026-10-15

## Context

The Atlas shows a model as pages: an overview, ownership, verification, publication readiness, diagnostics and a page
per behavior. Each page lists links in words, which is what review needs, but no page shows the network itself: which
records sit together, which capability has drawn the most behaviors, which verification hangs off nothing. Asked
whether the Atlas needed improving, the maintainer chose a visual tool that shows the network of connections, and
chose an interactive explorer over a static picture (2026-10-15).

Until now the Atlas carried no script (its own rule, and on intentset.org the site's rule that nothing inside
`<main>` runs one). An explorer needs one: finding a record among hundreds, hiding a family, focusing on one record's
links, panning and zooming are interaction. Streamlane's model is 926 records and 1,678 links, so the explorer
has to work at that size too.

## Decision

- **One page, `map.html`, carries the map.** Every record is a node and every authored link an edge (derived inverses
  are not drawn twice). It is in every page's navigation as Map, and on intentset.org under the worked example's Atlas
  at `/example/atlas/map/`.
- **The layout is computed when the Atlas is built, not in the browser.** A force-directed layout (Fruchterman and
  Reingold), repulsion within a grid cell's width and tapered to nothing at it, attraction along each link and a weak
  pull to the centre, run 300 steps from positions taken from each ID's FNV-1a hash, in ID order, with only arithmetic
  and square roots, coordinates rounded to a tenth. So the same graph gives the same bytes on every machine
  (RULE-DETERMINISTIC), whatever order its files are read in, and the browser draws rather than computes. On
  Streamlane's model the layout adds about 0.6 seconds to building the Atlas.
- **The picture stands without the script.** The SVG is complete on its own: each record with a page is a link to it,
  and every node and edge has a title saying what it is. The controls are rendered `hidden` and only the script shows
  them, so a reader without it never meets a control that does nothing.
- **The script adds, and only adds.** `atlas-map.js`, written beside the pages and loaded by the map page alone, after
  `<main>`: find a record by ID, show or hide each family, drag to pan, wheel or buttons to zoom, select a record to dim
  all but it and its links with a panel listing them, select again to follow its link, Escape to clear. It writes to
  the page with `textContent` only, so no record's text is parsed as markup, and reads no storage and makes no request.
  A test refuses `innerHTML`, `eval`, `fetch` and storage in it.
- **No dependency.** The layout is about a hundred lines and the script about 250; a graph library (Cytoscape, sigma,
  D3's force module) was the alternative, rejected because the package would take a dependency, and with it a supply
  chain, for what is a fixed layout and a few event handlers, and because a library computing layout in the browser
  would make the picture depend on the reader's machine.
- **Status reads as words.** A node's color is its family (purpose, product meaning, architecture, verification,
  knowledge); a draft is outlined dashed; a verification's ring is green only for a current pass, red for failing,
  amber for stale, skipped or missing, grey when not assessed. Each is also in the node's title, so nothing is said by
  color alone, and missing evidence never reads as a pass (Core §10).
- **The policies allow exactly this.** `intentset serve` adds `script-src 'self'` to its Content Security Policy.
  intentset.org's policy already allows the site's own scripts; its map page loads the script after `</main>`, and the
  build test counts it, so the rule that nothing inside `<main>` runs a script holds.

## Consequences

- A reader can see a model's shape and move through it by its links, at Streamlane's size, and the worked example's
  map is public on intentset.org.
- The Atlas is no longer script-free. The exception is one file on one page, with a test that holds both, and a page
  that still works when the file does not load.
- The whole-model picture of a large model is dense; the explorer is for finding and focusing, not for reading it all
  at once. Clustering by capability, or a map per capability, can come later if adopters ask for it.
- On the map, a record is a target the size of its circle. Find and the panel's links are the equivalent controls a
  reader can always use instead (WCAG 2.5.8), and the site's browser test counts the map's links apart for that reason.
