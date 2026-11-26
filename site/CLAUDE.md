# The site

Loaded when an agent works under `site/`; the repository's rules are in the root `CLAUDE.md`. Paths are
repository-relative.


- **Copy can be written and changed without approval** (Gary, 2026-10-06). It never invents a fact: no domain, link,
  contact address, price, legal or privacy claim, or claim that is not true today, such as a tool not yet released.
- **The bar is five sections by what a reader came to do** (2026-10-05, after markset.org's): Start, Tools,
  Reference, Examples, Roadmap. Home is the wordmark; About is in the footer's row. `RAILS` in `site/build.ts` lists
  each section's pages, shown beside every page in it: Start, one reading path (2026-11-25: the introduction, How it
  works, Try it on your code, then a group "Once one capability works" holding Model the whole product with many agents
  and Make agents' work safe to accept, each label the page's h1), Tools (all tools, the command, what reads a model,
  and the agent guide as "What your agents read"), Reference (the specifications, the Markset page, conformance, the glossary), Examples (one rail on every page
  of the section, 2026-10-20: "Lantern, a worked example", a group holding the walkthrough, the map and "Review pages",
  a group of the Atlas's five other pages; then the adoption log). A rail entry is a page or a group whose label is not
  a link (`RailItem`, `railLinks` in `site/build.ts`), drawn as nested lists. The bar's Examples opens on the walkthrough
  (`/example/`), the rail's first page, by the user's decision of 2026-11-25, which reversed the map of 2026-10-20;
  the walkthrough links the map in a button above its first step, so the map stays one click away. No URL moved when
  the bar or the rail changed. `site/test/rail.test.ts` requires every page to be named by the bar,
  a rail or the footer's row (a record by the example index) and within three links of home: a new page goes in a
  rail.
- `{{version}}` in a content page is the root `package.json` version; a test fails on a typed `at 0.x` or
  `version 0.x`. `{{usage}}` is the CLI's `USAGE`, so the command page cannot drift from `--help`.
- Beside the pages: `/guide.md` is `agentGuide()` from `@intentset/cli` with a placeholder scope (also rendered at
  `/guide/`), `/llms.txt` points agents at it and at markset.org/guide.md, every `spec/*.schema.json` is copied to
  `/spec/` where its `$id` points, and `sitemap.xml`, `robots.txt` and `404.html` come from the page list.
  `/conformance/` is generated from `tests/`.
- **Colours.** The accent is coralreefventures.com's Intentset token (`--crv-intentset-text`,
  `light-dark(#2c6a54, #7cc3a8)`), so the product reads in the same green on both sites. The neutrals are
  Intentset's own green-tinted ground and ink, **deliberately**: each family site's ground carries its own mark's
  color, decided 2026-10-05 and amended 2026-10-07, when markset.org left its cool white for a violet-tinted ground
  and coralreefventures.com's dark ground became warm. Do not "fix" them to one neutral. This site's light ground
  moved the same day for the same reason: it was a yellow-green (hue 69) under a tile at hue 168, and the scheme
  walked across the wheel as it darkened (ground 69, surface 100, border 132, accent 159, tile 168). All three light
  values are the tile's hue now, at the lightness they already had, so the contrast is unchanged to a hundredth. The
  dark ground was already the mark's hue and did not move.
- **The worked example is a walkthrough** (`EXAMPLE_ACTS` in `site/build.ts`, 2026-10-07): five acts of the model's
  chain, each with its own prose, and every record open on the page in a folding callout (Markset §4.1, a `<details>`
  with no script) rather than a link to a page a reader has to leave for. A new record goes in an act; the build
  throws when one is in none. Each record keeps its own page, and each fold links to it. **The knowledge is the one
  approved record** (2026-10-11, #48): reviewed against its three sources with their real hashes pinned, and carrying
  two tips, so the last act ends with what `intentset publish` writes for it, published at build time from a copy of
  the example (`site/example-publication.ts`). Editing `BEH-ASMT-SCHEDULE`, `RULE-ASMT-AUTH` or `RULE-ASMT-FUTURE`
  changes a pinned hash: review the knowledge against the change, re-pin it (`shasum -a 256`) and update `reviewedAt`,
  or `test/tooling.test.ts` fails and the site build refuses to publish. A fixture or test that wants the draft the
  record used to be patches `status: draft` itself.
- **The illustrative change is told one way** (2026-11-25), on Home and in the introduction (`#problem`, `#trust` and
  `#review`): an agent fixing assessments that open an hour late in Lantern hands back 2,140 lines in 31 files, and
  one of its changes loosens `RULE-ASMT-FUTURE` to accept a release time up to an hour in the past, with the test that
  expected the refusal changed to match. It is always labelled illustrative, with Lantern named as invented. Change it
  in both places or neither. No page says a pass counts only "on this commit": a pass counts while what it checked is
  unchanged, and a gate may ask for a pass on the commit under review (Streamlane SL-710).
- **The worked example's Atlas** (`site/example-atlas.ts`, 2026-10-15) is the example's records validated at L1 and
  drawn by `@intentset/atlas` with its `example` notice, rendered in the site's shell under `/example/atlas/` in the
  Examples rail. Each record's page is the Atlas's (2026-11-02): served at `/example/<ID>/`, the address the
  walkthrough's folds always linked, it holds the record in one card (its file, linked on GitHub at main, every
  frontmatter field, then its text) with what the Atlas derives below it; the rail names the record beneath Records,
  a review page that lists every one; the site's own record page and the Atlas's behavior page at `/example/atlas/behaviors/<ID>/` gave
  way to it, so each record has one page, inside the navigation. The map was Lantern's landing page from 2026-10-20 until the user's decision of 2026-11-25 put the bar's
  Examples on the walkthrough: its h1 is still "Lantern, a worked example", it links the walkthrough and the review
  pages under the picture, and the other ways into the example (the home page, Tools, How it works, the roadmap)
  still lead to it. It has no run evidence and no commit, because the example's check has not been executed and the
  pages describe records rather than a commit. Only an invented product's Atlas is published: Intentset's own model
  has no public Atlas, and a public mode for one is undecided. Its Map page carries the SVG and controls `mapHtml`
  draws, with links at the site's addresses, placed in the page's map slot (`placeHtml`), and the map's stylesheet and
  script are written beside the pages.
- **The Atlas's map** (ADR 0015, `packages/atlas/src/map.ts` and `map-script.ts`) is the one place the Atlas runs a
  script, and the picture works without it. Its layout is computed at build time and must stay deterministic: no
  `Math.random`, no trigonometry or `Math.exp` (their results differ between engines), iteration in ID order, and
  coordinates rounded. The map comes first on its page, the legend and instructions below it, and where IDs show no
  ID may overlap another record (a separation pass after the forces, tested on a crowded graph). The script writes text, never markup (a test refuses `innerHTML`, `eval`, `fetch` and
  storage), and adds no dependency.
- **Home's failure excerpt is real output** (2026-11-25): the `intentset review --fail-on-drift` lines under "What it
  is" were produced by running this repository's CLI in a scratch repository made with `intentset init --example`,
  and their caption says how. `site/test/content.test.ts` holds each line to the strings `review.ts` writes, so a
  change to the command's words fails until the excerpt is run again and requoted. The one illustrative change
  (Lantern, 2,140 lines in 31 files, the release-time rule loosened by an hour) is always labelled illustrative, with
  Lantern named as invented, and the test holds the problem card's foot. **The glossary** (`/glossary/`, Reference)
  defines the site's words in reef's `docs/family.md`'s terms and names neither product.
- **A page's h1 does not end in a period** (2026-10-07), on a content page or a rendered document: a title is a
  label, not a sentence. The h2s below it are written as sentences and keep theirs.
- **A code block runs to the document's width**, not the reading measure (`site.css`, 2026-10-07): a line of prose
  wants the shorter measure and a command, which cannot wrap, does not.
- **The line saying where a rendered document comes from sits under the h1**, never above it (`underHeading` in
  `site/build.ts`): the agent guide and every specification page.
- **The social card is drawn by hand and committed** (2026-10-07): `pnpm run social-card` writes
  `site/social-card.png` from `site/social-card.ts`, the build copies it, and every page but the 404 names it as
  `og:image` with `twitter:card` at `summary_large_image`. It is drawn rather than generated at build time because
  CI and the deploy should not need a browser; redraw it when the mark, the tagline or the tokens change.
  `site/test/build.test.ts` holds the committed file to the size the pages claim.
- **The chat panel** (`site/chat/`, SLICE-ASK, 2026-10-09) is plain JavaScript and CSS, copied into the build only
  when `ASK_URL` is set. It builds its own markup (a launcher and a non-modal dialog), so a reader without scripting
  sees the documentation as it was; it renders answers as DOM nodes, never HTML; and it keeps the conversation in the
  tab's sessionStorage, so it follows the reader between pages. `site/test/chat.test.ts` drives it in Chromium against
  a stub of `POST /ask`, at 390 and 1440 pixels in both schemes.
- **The chat's corpus is the site** (2026-10-09): `site/corpus.ts` builds what the chat on intentset.org answers from
  out of `siteInputs()`, the same sources, tokens and addresses the pages are built from: every content page but the
  404, the specifications, the agent guide, the example's records and published knowledge, each with its canonical
  URL. **Published knowledge** (2026-10-10) is every knowledge record in this repository's own model that
  `intentset publish` releases: `site/knowledge.ts` runs the CLI's own `publish` for a public projection, once per
  product record and per audience, release, role and edition the registries declare, with no flags, and takes the
  union; it decides nothing itself, so a draft, retired, non-public or unreviewed record, or one whose sources changed
  since its review, never reaches the site or the chat (RULE-ASK-PUBLISHED-ONLY). Each released record gets a page at
  `/knowledge/<ID>/`, rendered as an example record is, and `/knowledge/` lists them in the Reference rail; with none
  released (the case until a maintainer approves one), neither exists. A model that does not validate fails the
  build. `site/test/knowledge.test.ts` holds it against a fixture model with an approved, a draft and a stale record. It is written to
  `amplify/functions/ask/corpus.json` by `pnpm run corpus` and never committed; the backend's deploy builds it from
  the commit it deploys. The whole corpus is sent, cached, with every question, so `site/test/corpus.test.ts` holds it
  under `TOKEN_BUDGET` (about 46k of 100k estimated tokens at first). A new page joins it by joining the site.
- **The footer is the family's** (2026-10-06, the same on markset.org): the row (the bar and About), then one line,
  `Intentset · Keep control of what your agents build. · Source on GitHub · A Coral Reef Ventures project · Sibling
  project: Markset`, then the family's mark. It links the sibling site, markset.org, once, as markset.org's links this
  one. `site/test/build.test.ts` holds the shape.

- `site/content` is the site copy's source of truth. The IA document in `docs/requirements/` stays frozen as the
  handoff, and the site's words need not match it.
