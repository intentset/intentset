# The site

Loaded when an agent works under `site/`; the repository's rules are in the root `CLAUDE.md`. Paths are
repository-relative.


- **Copy can be written and changed without approval** (Gary, 2026-10-06). It never invents a fact: no domain, link,
  contact address, price, legal or privacy claim, or claim that is not true today, such as a tool not yet released.
- **The bar is three sections by what a reader came to do** (the user's decisions, 2026-11-26, replacing the five of
  2026-10-05): How it works, Get started, Reference. Home is the wordmark; the slide deck ("Slides") and About are in
  the footer's row, and no page's body links the deck. `RAILS` in `site/build.ts` lists each section's pages, shown
  beside every page in it: How it works (the explanation, then "The shop's model, record by record" at `/example/`);
  Get started (Set up Intentset, then Add Intentset to your CI at `/start/ci/`, then a group "Once one capability
  works" holding Model the whole product with many agents and Make agents' work safe to accept, each label the page's
  h1); Reference (a Tools group with all tools, the command, "See your model in a browser" at `/tools/serve/` and the
  agent guide as "What your agents read", then a Specifications group, conformance, the glossary). The serve page says
  what `intentset serve` is and opens the shop's Atlas in a new tab (`NEW_TAB` in `site/build.ts`, since Markset has no
  syntax for a target); the Atlas's pages are in no rail, because they are the Atlas's own (Gary, 2026-11-26). The Markset page left the site on
  2026-11-26 (the user's decision; `/markset/` redirects to markset.org): the glossary's Record entry says records are
  written in Markset and read as plain Markdown, which is all a visitor needs. Examples left the bar
  on 2026-11-26: it held one example, now told on How it works and drawn by the review pages. A rail entry is a page
  or a group whose label is not a link (`RailItem`, `railLinks` in `site/build.ts`), drawn as nested lists. The adoption log, the roadmap and the readers page left the site on
  2026-11-26 (the user's decision): their old addresses are pages that send the reader to `docs/adoption/log.md`,
  `docs/roadmap.md` and `docs/consumers.md` on GitHub (`REDIRECTS` in `site/build.ts`), and none is in the sitemap.
  No page has an "On this page" contents rail (2026-11-26, the user's decision, for the whole site, the rendered
  specifications included). The setup page was "Try it on your code" until 2026-11-26: it holds the real setup, so
  it is "Set up Intentset", and the CI job, the required check, other CI systems and the baseline are on a page of
  their own so the rail shows where they are; every command in that job was run, with the published CLI, in a
  scratch repository before it was quoted. No URL moved when
  the bar or the rail changed. `site/test/rail.test.ts` requires every page to be named by the bar,
  a rail or the footer's row (a record by the example index) and within three links of home: a new page goes in a
  rail.
- `{{version}}` in a content page is the root `package.json` version; a test fails on a typed `at 0.x` or
  `version 0.x`. `{{usage}}` is the CLI's `USAGE`, so the command page cannot drift from `--help`.
- Beside the pages: `/guide.md` is `agentGuide()` from `@intentset/cli` with a placeholder scope (also rendered at
  `/guide/`), `/llms.txt` points agents at it and at markset.org/guide.md, every `spec/*.schema.json` is copied to
  `/spec/` where its `$id` points, and `sitemap.xml`, `robots.txt` and `404.html` come from the page list.
  `/conformance/` is generated from `tests/`.
  `/changelog/` (Reference, 2026-11-27, #166) is rendered from `CHANGELOG.md` and `/changelog.xml` is its Atom feed, one
  entry per release (id and link `/changelog/#v<version>`, `updated` the release date, content the summary, or the first
  paragraph before 0.18.0), linked from every page's head; it is exempt from the naming rule as the specifications are
  (`generatedFrom: "changelog"`), and it is not in the chat's corpus.
- **Colours.** The accent is coralreefventures.com's Intentset token (`--crv-intentset-text`,
  `light-dark(#2c6a54, #7cc3a8)`), so the product reads in the same green on both sites. The neutrals are
  Intentset's own green-tinted ground and ink, **deliberately**: each family site's ground carries its own mark's
  color, decided 2026-10-05 and amended 2026-10-07, when markset.org left its cool white for a violet-tinted ground
  and coralreefventures.com's dark ground became warm. Do not "fix" them to one neutral. This site's light ground
  moved the same day for the same reason: it was a yellow-green (hue 69) under a tile at hue 168, and the scheme
  walked across the wheel as it darkened (ground 69, surface 100, border 132, accent 159, tile 168). All three light
  values are the tile's hue now, at the lightness they already had, so the contrast is unchanged to a hundredth. The
  dark ground was already the mark's hue and did not move.
- **The shop's model is one page** (`EXAMPLE_ACTS` in `site/build.ts`; the walkthrough since 2026-10-07, the shop's
  since 2026-11-26): five acts of the model's chain, each with its own prose, and every record open on the page in a
  folding callout (Markset §4.1, a `<details>` with no script). A new record goes in an act; the build throws when one
  is in none. Each record keeps its own page, and each fold links to it. **The help article is the one approved
  record**: reviewed against its three sources with their hashes pinned by `intentset approve`, and carrying two
  tips, so the last act ends with what `intentset publish` writes for it, published at build time from a copy of the
  example (`site/example-publication.ts`). Editing `BEH-RESET-PASSWORD`, `RULE-RESET-LINK-EXPIRY` or
  `RULE-RESET-LINK-ONCE` changes a pinned hash and the build refuses to publish: review the article against the
  change and renew the review with `intentset approve KB-RESET-PASSWORD --renew-review --by <name>`, which also
  writes `self` and `gates`; an agent runs that only when the reviewer says so, and never writes the pins,
  `reviewedBy` or `reviewedAt` itself (Core §7).
- **The example is told one way** (2026-11-26, the user's decision, replacing Lantern's release-time change): an online
  shop's password reset links work for one hour (`RULE-RESET-LINK-EXPIRY`); customers report links that have expired
  by the time they click them, and the agent asked to fix it raises the limit to 24 hours and changes the test that
  expected one hour, so a security decision is made as a bug fix; CI is green, and nobody decided it (the agent's reason
  is told, 2026-11-26, so the change reads as believable rather than random). Home, How it works and
  the introduction (`#problem`, `#review`) tell it as an example, without a label calling it invented (the user's decision, 2026-11-26: a card titled "An
  example" says enough). Its records are `examples/shop/` (`EXAMPLE_DIR`), 17 of them, which `intentset init --example` writes, the decision that set the hour among
  them, which the drift output lists. Change it in all three places or none. No page says a pass counts only "on
  this commit": a pass counts while what it checked is unchanged, and a gate may ask for a pass on the commit under
  review (Streamlane SL-710). Lantern is the CLI's example (`intentset init --example`) and the conformance suite's
  baseline under `examples/scheduling/`, and no page of the site shows it; its old record pages redirect to its files.
- **The shop's Atlas is published as `intentset serve` writes it** (`site/example-atlas.ts`, Gary, 2026-11-26): the
  Atlas's own pages, look and navigation under `/example/atlas/`, not wrapped in the site's shell, in no rail and not
  in the sitemap (each page says noindex). `shopAtlas` builds it the way a team would get it: a scratch repository with
  the shop's records under `product/shop/` and its code and tests (`examples/shop/src/`), committed with fixed dates;
  the tests run with node:test's TAP reporter (outside the test runner's `NODE_TEST_CONTEXT`, or a child reports to
  the parent instead of printing TAP) and imported as run records with fixed times; then a later commit renames a
  parameter in the sign-in code, so the sign-in check's pass is stale by subject binding; then `atlasOf` from
  `@intentset/cli` at L3 with the `example` notice. So the Atlas shows one draft (BEH-SIGN-IN), the reset link's rule
  verified, two stale claims and one rule no test checks (RULE-RESET-LINK-ONCE), and the build gives the same bytes
  every time. The one-page model links each record to `atlas/records/<ID>.html`; the old site-shell addresses
  (`/example/<ID>/`, `/example/atlas/<page>/`) redirect there. Only an invented product's Atlas is published:
  Intentset's own model has no public Atlas.
- **The Atlas's map** (ADR 0015, `packages/atlas/src/map.ts` and `map-script.ts`) is the one place the Atlas runs a
  script, and the picture works without it. Its layout is computed at build time and must stay deterministic: no
  `Math.random`, no trigonometry or `Math.exp` (their results differ between engines), iteration in ID order, and
  coordinates rounded. The map comes first on its page, the legend and instructions below it, and where IDs show no
  ID may overlap another record (a separation pass after the forces, tested on a crowded graph). The script writes text, never markup (a test refuses `innerHTML`, `eval`, `fetch` and
  storage), and adds no dependency.
- **The slide deck is for a structured presentation** to people interested in learning about Intentset and adopting it,
  and says the value it brings (Gary, 2026-11-26). Ten slides that follow Home: the problem, why it happens, the
  promise written down, the check, what a team gets, how a team works, what it replaces (nothing), adopting it one
  feature at a time, and setting it up. No part dividers, levels table or file-format slides: the detail is How it
  works'. It is linked only from the footer's row, as "Slides".
- **The failure excerpts are real output** (2026-11-26): the `intentset review --fail-on-drift` lines on Home and How
  it works were produced by running this repository's CLI on the password reset fixture in a scratch repository, and
  `site/test/content.test.ts` builds that repository again and reruns them: the excerpts must appear in a review that
  exits 1, and the rule diff and the `Intentset-Unchanged` trailer must each make it pass. Another test holds Home's
  lines to the strings `review.ts` writes. **The glossary** (`/glossary/`, Reference) defines the site's words in
  reef's `docs/family.md`'s terms and names neither product.
- **Home stays short** (2026-11-26, the user's decision, after "the home page is massive" at 2,816 words): the
  promise, one example, how it works in three steps, what it is, and one way to try it, under 800 words
  (`build.test.ts` holds it). No versions, no draft or review status and no family products on a narrative page or the
  specifications index (2026-11-26): each specification's own page names its ID, revision and the release that
  implements it in its banner, without a status badge. The index's cards are rows, one per document, each titled
  without its version and saying first what the document gives a team.
- **No figures from Coral Reef Ventures' own use on a narrative page** (the user's decision, 2026-11-26): beside the
  invented example they read as the example's numbers, and "the check ran 367 times" left a reader asking which check.
  They live in `docs/adoption/log.md`.
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
