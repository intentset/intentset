# Intentset

Intentset keeps product intent, observable behavior, implementation ownership, verification and published knowledge
connected, as readable Markdown files with YAML frontmatter in a repository. The graph, reports, Atlas and published
knowledge are derived views; the files are authoritative. This repository is the v0.4 specifications, the conformance
suite, the reference implementation in TypeScript, and the intentset.org site.

**`spec/` is the source of truth**: `core-0.4.md`, `vsa-0.4.md`, `profile-contract.md` (what a profile is and what a team may write in
`.intentset/profile.yaml`, `intentset/profile-contract/0.1`; ADR 0030), `profile-typescript-amplify-gen2-0.4.md`, `profile-typescript-nextjs-0.4.md` (the Next.js profile and its rule set),
`export.md` (the export contract other tools pin, `intentset/export/0.8`), `list.md` (the result `intentset list`
writes, `intentset/list/0.1`, and the selector it reads; ADR 0016), `publication.md`, `frontmatter.schema.json`, `conformance.schema.json`, `export.schema.json`, `evidence.schema.json` (run records). Read the Core spec before implementing
anything. When code and spec disagree, the spec wins, or the spec changes first in the same commit. Each spec opens with
frontmatter (`title`, `id`, `status`, `revision`, `implementation`) that the site renders; Core §1 is the change policy.
`docs/requirements/` is the kickoff handoff as delivered and is not updated (`markset/` in it is the half delivered to
Markset, moved here from Markset's `docs/expansion-requirements/` 2026-10-05); `docs/implementation-plan.md` is the plan;
`docs/decisions/` holds the ADRs; `CHANGELOG.md` the release history.

## Design invariants

These are non-negotiable. If a proposed change conflicts with one, the change loses.

1. **One carrier, one record per artifact.** Markdown with YAML frontmatter under `intentset:`. Tools never merge
   duplicate records and never rewrite files, with two exceptions, each only when asked and each refusing a tree with
   uncommitted changes to tracked files unless `--allow-dirty` says otherwise: `intentset migrate
   --to <spec>` rewrites `spec` and `profile`, applies that version's transforms (for `0.3`, ADR 0023's status rewrite
   and ADR 0025's move of the review), re-pins the review pins that matched before the move, and, for `0.4`, writes
   VSA016 for TS007 in each exception record's `rule` and in the entries of the baseline `--baseline` names, and moves
   the shipped profile `.intentset/profile.yaml` extends (ADR 0030); and `intentset approve`
   (ADR 0022) rewrites `status` and `approval` in the drafts it is given, and the review of a knowledge record among
   them, and, with `--renew-review`, only the review of the approved or deprecated knowledge it is given. Unknown keys inside
   `intentset` are errors except under `extensions`; unknown top-level keys are preserved and never interpreted.
2. **Authored forward edges only.** Relationships are written once in the Core §5 direction; every inverse is
   derived and marked derived. A reverse edge in a file is a mistake, not a convenience.
3. **Definitions are not evidence.** A verification record says how a claim is checked. Only a `pass` whose binding
   holds is current: under subject binding (the default wherever slices claim files, ADR 0013) while the subject its
   check is about is unchanged (a resource's files are in the subject only where the verification exercises the
   resource or an implementing slice owns it, and a slice reached only through `dependsOn` contributes every claimed file;
   ADR 0013, amended 2026-10-15 twice, and ADR 0026, which made that the one rule), under commit binding (`evidence.binding: commit`, or `--binding commit`) at the assessed
   commit and graph hash. Stale, skip, error, fail and missing never count as pass, and link coverage and current-pass
   coverage are always reported separately.
4. **Publication fails closed.** Deny by default, intersect every availability dimension, exclude draft and retired,
   never leak an excluded source's title or path. Documentation metadata never grants runtime access.
5. **Profiles are metadata, not syntax.** No `:::behavior`, no new Markset directive, ever. Markset owns the document
   grammar; Intentset owns meaning. Markset diagnostics (origin `syntax`) and Intentset diagnostics (every other
   origin) are never mixed into one list without the origin field.
6. **Checks report what they could not check.** `unresolved` is never `pass`. A waiver produces "with exceptions",
   never unqualified conformance. Every count names its snapshot, denominator and whether it measures links or evidence.
7. **No code execution, no network, no mutation** in `validate`, `graph`, `architecture check`, `evidence stale`, `impact`,
   `list`, `review`. Publication and serving are separate explicit commands.
8. **`@intentset/core` has no dependencies.** Everything Markset is in `@intentset/markset-adapter` and nowhere else.
   `@intentset/conformance-suite` has no dependencies either: it is what another implementation is checked against.

## Working rules

- Family conventions: reef's [`docs/conventions.md`](https://github.com/Coral-Reef-Ventures/reef/blob/main/docs/conventions.md)
  (commits, releasing and the first-publish trap, CHANGELOG, ADRs, README, this file's shape, tooling tests, the site
  baseline). Departures: none yet; one is written here with its reason.
- **Fixtures before code.** A check ships with its cases in `tests/<section>.json`: one passing case, one failing case
  per condition in the spec's sentence, one boundary case. Catalog IDs (C01, V02, E03, P04, L05) prefix the case name.
- **Spec, fixtures and implementation change in the same commit.**
- Diagnostics are specified behavior: code, severity, origin, artifact, path, location when known, field as a JSON
  pointer, message, remediation. Sorted by `compareDiagnostics`. Every code is defined in a spec, and one no check
  reports is called a review assertion there (`test/codes.test.ts` holds both). A change that invalidates an existing
  case, in any section and against any spec, is breaking: it moves `intentset.spec` (Core §1) and says so in the
  CHANGELOG. Relaxing a case so that nothing which conformed stops conforming is not.
- Determinism: same inputs, same bytes. Canonical JSON for anything hashed. Sort everything you iterate.
- Don't add dependencies without asking. Approved so far: `@markset-lang/parser` and `@markset-lang/render-html` at
  exactly 0.6.0 (adapter, publisher, atlas, site), `@modelcontextprotocol/sdk` (mcp only), `typescript` as a peer of
  architecture, Playwright and Biome as dev dependencies, and for the chat's backend (2026-10-09, pinned):
  `@aws-amplify/backend`, `@aws-amplify/backend-cli`, `aws-cdk`, `aws-cdk-lib`, `constructs`, `esbuild` and
  `@types/aws-lambda` at the root, and `@anthropic-ai/bedrock-sdk`, `@anthropic-ai/sdk` and the DynamoDB clients in
  `amplify/`. `pnpm install` is run by whoever owns the root; agents working
  in parallel do not run it.
- No Streamlane record or code enters this repository; the adoption log describes them. Its records live in the
  Streamlane repository.
- The example products are invented: Lantern for the fixtures, the conformance suite and `intentset init --example`
  (`examples/scheduling/`), and an online shop (`examples/shop/`, 2026-11-26), which the site shows and `intentset init
  --example` writes. Nothing in this repository names another real product, except as the next rules allow, and the one
  real product it models is Intentset itself.
- **Intentset's own model** (`product/model/`, decided 2026-10-09) describes this repository's packages: what each
  promises, which package delivers it, and the design invariants as rules. It is not an example: no fixture, test or
  site page reads it, and the example's records never link into it. The one exception is published knowledge
  (2026-10-10): a knowledge record in it that `intentset publish` releases to the public gets a page on the site and a
  place in the chat's corpus, through `site/knowledge.ts`; nothing else in it reaches either. "Intentset's own model" below says how it is
  kept.
- **No page of the site names Streamlane or Driftline** (the user's decision, 2026-11-26, replacing Gary's of
  2026-11-25 and the family loop on Home): a visitor to intentset.org came to learn Intentset, and a product they
  cannot use reads as a different product entirely. No page links to either. The normative documents under `spec/` and
  the conformance cases under `tests/` are outside the rule where they record the origin of a dated decision; its test
  skips a page by how it is made (`generatedFrom` in `site/build.ts`), not by its address. `site/test/family.test.ts`
  holds it. `CHANGELOG.md` is published as `/changelog/`, so it names neither: write "an adopter" or "a tool that
  reads the export" (2026-11-27).
- The adoption log (`docs/adoption/log.md`, on the site at `/pilot/` until 2026-11-26, which now redirects there)
  names Streamlane and Driftline by Gary's decision of 2026-10-06. It shows Intentset's side: records, check output
  and counts, each with its source and date, and the friction as well as what worked. Never the products' insides
  (screens, prices, roadmap detail, account ids, operation, function and log names, unreleased capabilities' names),
  never a link into their private repositories, and no quoted code beyond a one-line identifier such as the
  `exercised(context, "BEH-…")` call shape. Intentset record IDs of what the log describes are allowed, and check
  output, commit trailers and the usage-evidence format may be quoted, with operation names replaced by `<operation>`.

## Where the rest is

Each of these loads when an agent works in its directory, so read it before changing anything there:
`packages/CLAUDE.md` (the Core API every package builds against), `site/CLAUDE.md` (intentset.org: the bar, the rails,
the worked example, the Atlas, colours, the chat panel and its corpus) and `amplify/CLAUDE.md` (the chat's backend,
learning from questions, and the AWS rules).

## Conventions

- Diagnostic codes: `CORE001`–`CORE013`, `CFG001`–`CFG002` and `EVID001`–`EVID006` (Core §11, one code per kind
  of thing to fix, ADR 0024: an unreadable carrier is CORE010, a missing section CORE011, a field CORE001; an outcome
  with no measure is CORE009 draft, CORE012 past draft; a surface two slices declare is CORE013), `VSA001`–`VSA016` and `REG001` (VSA §2, §5, §9; VSA015 is the portable rule for the packages a profile lists as reaching outside and VSA016 the package policy, ADR 0030), `TS001`–`TS006` and `TS008` (TS007 is retired: it was the package policy until `0.4`, and a retired code is never reused) and
  `AMP001`–`AMP013` (profile §2 to §4, §9), `NEXT001`–`NEXT004` (the `nextjs` rule set, Next.js profile §2), `PUB001`–`PUB004` (publication §4). Three digits always.
  Markset's diagnostics (origin `syntax`) keep Markset's own AREA_NAME codes (`DIRECTIVE_UNKNOWN_NAME`); the export
  schema, the conformance schema and `readExport` key the code's shape on the origin, and a host never renames either.
- A release bumps every manifest, each spec's `implementation`, and adds its `CHANGELOG.md` entry: one bold sentence,
  then whether the specs, the suite or the export moved (tests hold all three). `pnpm run release:prepare <version>`
  writes every carrier and dates the Unreleased entry, and refuses one that has drifted; the `v<version>` tag on main
  publishes and creates the GitHub Release from the entry (`pnpm run release:notes <version>` prints it). An entry opens
  with a summary under `### Breaking`, `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed` and
  `### Security`, one line per change pointing to its ADR or issue, then `### Details` (`release:prepare` refuses an
  entry without one). A spec's `revision` is the date its text last changed.
- Before 1.0 a changed export envelope is a minor bump of the packages; Driftline reads exports and Streamlane reads the
  repository's records and run records (`docs/consumers.md`), and each moves its pin when it updates. A reader rejects an older export, and a record that declares an older `spec`:
  `intentset migrate --to <spec>` rewrites `spec` and `profile` in a repository's records.
- Package layout: `packages/<name>/src/index.ts` is the public surface; `test/*.test.ts` with `node --test`;
  `tsconfig.build.json` extends `../../tsconfig.build.base.json`.
- Site output uses Markset's `ms-` classes and `site/site.css` layered over `markset.css`. No script inside `<main>`:
  the only two are the shell's, ahead of `<main>` (the colour scheme, and the Copy button each code block gets at
  runtime), and nothing rendered from a document carries one. A test holds the count at two. When the site is built with the chat's address
  (`ASK_URL` in `site/build.ts`, null until the launch), every page also links `chat/panel.css` and loads
  `chat/panel.js` after `</main>`, with the address in a data attribute: three scripts, still none inside `<main>`, and
  `site/test/chat.test.ts` holds that build. The default build has no chat, and `build.test.ts` holds it at two.
  The shop's Atlas under `/example/atlas/` is the Atlas's own pages, not the site's, so the shell's scripts and
  this count do not apply to it; its map page loads the Atlas's one script (ADR 0015).

## Layout

```
spec/                 normative documents and schemas
tests/                conformance fixtures, one JSON file per section (core, export, vsa, evidence, publication, list)
tests/consumer/       export consumer fixtures and manifest.json (spec/export.md §6), built by `pnpm run fixtures:consumer`
                      from packages/conformance/src/consumer.ts; a test fails when the committed copy differs
examples/scheduling/  Lantern, the fixtures' and the conformance suite's baseline, which no page shows
examples/shop/        the invented online shop: its records, and its code and tests under src/; the site's example
                      and what `intentset init --example` writes
product/model/        Intentset's own model: the product, intent, outcomes and their measures, capabilities, behaviors,
                      rules, verifications, one decision, and one slice per package under slices/<package>/slice.md
.intentset/           its configuration, registries, architecture.yaml and agents.md; evidence/ is local run output
packages/
  core/               carrier reader, types, graph, validator, impact, export, select. No dependencies.
  markset-adapter/    the one Markset import
  architecture/       M2: claims, import graph, layers, resources, exceptions, baseline; the readers (reader.ts) and
                      the profiles, shipped and a repository's own (profile.ts, ADR 0030)
  verification/       M3: run records, freshness, reporter adapters, what needs a run (evidence stale)
  publisher/          M4: projection and generated Markset, and the help file (publication §5)
  help/               reads help.json, binds tips to the controls of a product's interface and lists a page's lead
                      articles. No dependencies, runs in a browser; the binder takes any root with querySelectorAll,
                      so it is tested without a DOM
  atlas/              M4: static review pages over an export
  cli/                `intentset`
  conformance/        private harness
  conformance-suite/  published cases, consumer fixtures and schemas as data
  mcp/                M5: read-only context server
site/                 intentset.org: build.ts (pages, rails, sitemap, 404, /guide.md, /llms.txt, schemas under /spec/),
                      content/*.md, site.css over markset.css, serve.ts for site:watch, corpus.ts (the chat's corpus),
                      knowledge.ts (the knowledge `intentset publish` releases from product/model/)
test/                 tooling.test.ts (the repository's shape), codes.test.ts (spec, suite and code agree on codes),
                      harness.test.ts, consumer/smoke.ts (install the packed or published packages and use them)
docs/                 implementation-plan.md, decisions/, requirements/ (frozen handoff), pilot-findings.md, consumers.md
amplify/              the chat's backend (SLICE-ASK): backend.ts, settings.ts, functions/ask/, test/, eval/ (the chat's eval)
CHANGELOG.md          every release, newest first; README.md, SECURITY.md, LICENSE
```

## Toolchain

- Node ≥ 22.18, TypeScript run directly by type stripping: erasable syntax only, explicit `.ts` import extensions.
- pnpm workspaces (`pnpm-workspace.yaml`; pnpm pinned by `packageManager`). `pnpm test` (node --test),
  `pnpm run conformance`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run format`, `pnpm run site`,
  `pnpm run social-card`, `pnpm run corpus`, `pnpm run model:validate`, `pnpm run model:review`,
  `pnpm run model:evidence` ("Intentset's own model" below),
  `pnpm run site:watch`, `pnpm run build` (publishing only, to `dist/`). Moved from npm on 2026-10-04 with the lockfile
  imported, so no version changed. Siblings keep `^<version>` ranges, linked by `linkWorkspacePackages`. A file may
  import only what its own package declares: the root links every workspace package for the tests, and
  `markset-adapter` declares `@types/mdast`, which its declarations import. The release publishes with
  `pnpm --filter <name> publish --provenance`, pnpm's own trusted publishing; the smoke test packs with pnpm and
  installs into a pnpm project. `init` writes the agent guide with `pnpm exec` in a pnpm repository, `npx` otherwise.
- Every published manifest lists the `intentset-source` export condition first, pointing at `src`, so this repository
  runs TypeScript while an installed consumer gets `dist`.
- Biome config is `biome.jsonc`, deliberately not `.json`.
- The site's browser checks run Playwright (Chromium) at 390px and 1440px, over a small HTTP server rather than
  file URLs, so the 404 page (linked from the root, served by Pages at any missing address) is checked as served.
- **Every page carries a Content Security Policy in a meta element** (`contentSecurityPolicy` in `site/build.ts`),
  because GitHub Pages sets no headers: scripts from the site and the shell's two inline scripts by hash, and the
  chat's API as the one other origin. A new inline script, or a new origin a page calls, changes the policy in the
  same commit; a build test holds every page to it. A meta policy cannot forbid framing or set HSTS: those need a
  host that sets headers.
- **Everything that parses Markset also runs under micromark's development build**, as Markset does: `pnpm test` ends
  with `test:development`, `conformance:development` runs beside `conformance` in CI and the release, and the smoke
  test runs its consumer a second time with `--conditions=development`. Vite, Vitest and Next resolve that asserting
  build by default, and Markset 0.3.3 passed every production run and threw on any link under it.

## Intentset's own model

This repository keeps its own Intentset model (decided 2026-10-09), checked by the CLI built from this checkout, so a
change to the toolchain is checked by the toolchain it produces. Keep it as the guide below says, in the same commit as
the code. The guide is generated and says `pnpm exec intentset`; here that is `pnpm run intentset`, which runs the CLI
from source (the installed bin points at `dist/`, which only the build writes).

@.intentset/agents.md

- **One slice per package**, `product/model/slices/<package>/slice.md`: its entrypoint is the package's `index.ts`
  (`harness.ts` for the private harness), and other packages reach it as `@intentset/<name>` through the
  `intentset-source` condition (`.intentset/architecture.yaml`). `dependsOn` mirrors the package's dependencies, so
  design invariant 8 is held by the architecture check as well as by the manifests: core, help and the suite depend on
  no slice. A test reaches another package only through its entrypoint: the conformance harness re-exports the
  fixtures, the schema validator, `firstMismatch` and the report formatters for the packages' tests, and its manifest
  exports nothing else. The site is composition.
- **Layers are empty, and VSA006 stays** (ADR-PACKAGE-LAYERS, `product/model/decisions/`, 2026-10-10). A package has
  no presentation, policy or model layer, so the package slices declare none and the check warns, once per package
  with modules beside its entrypoint (eight today), that their imports were not layer-checked. That warning is the
  true statement (design invariant 6): do not silence it with a made-up layer assignment, a baseline or an exception.
  SLICE-ASK is outside the decision; whether it declares layers is its own call.
- **The chat on intentset.org is SLICE-ASK** (`product/model/slices/ask/`, 2026-10-09), with its intent, two outcomes,
  two capabilities, six behaviors and four rules: answers only from what is published, nothing kept identifies a
  visitor, questions kept 90 days, and spend capped. The slice claims `amplify/` and `site/chat/`, so the site's
  composition region is listed around `site/chat/`. It is a draft whose paths are planned, which the check reports as
  warnings until the code exists.
- **The design invariants are rules** (`product/model/rules/`), and the specifications stay the normative text: a
  record points at a section, never restates one.
- **Verification records** (`product/model/verifications/TEST-*.md`, 2026-10-10): one per behavior that has tests,
  its selector the behavior's ID, which the titles of the tests that exercise it carry (`test("BEH-EXPORT: graph
  prints …")`, or a `describe` group's title). A test that exercises two behaviors names both (`BEH-IMPACT,
  BEH-CONTEXT: …`). Tag a test only when it checks what the behavior promises; a renamed or untagged test leaves its
  selector unmatched, which the import lists. Every behavior has one.
  No rule has one: the tests that touch a rule cover part of it, and a partial check is not a verification.
- **Evidence**: `pnpm run model:evidence` reruns the tests with node:test's TAP reporter into `.intentset/evidence/`
  (ignored) and imports them with `intentset evidence import --from node-tap`, bound to the commit, so it refuses an
  uncommitted tree. The `test` job in `ci.yml` runs it after `pnpm test` and then validates at L3, which reports link
  coverage and current-pass coverage apart; an approved behavior with no current pass fails it, and the rules, drafts with
  no verification, are reported and fail nothing.
  `intentset evidence stale` (ADR 0013, BEH-EVIDENCE-STALE) lists what has no current pass, as a table, JSON, or the
  arguments for `playwright`, `vitest` or `node-test` to run only those tests; read-only, exit 0 unless `--check`
  finds something to run. A runner's pattern is a substring match where `selectorMatches` is whole-token, so it may run
  a few extra tests, never fewer.
- **Measures** (`product/model/measures/`): MEAS-QUESTIONS-ANSWERED reads the questions the chat keeps (evidence
  source `chat-questions`), through the questions report. Each of the toolchain's three outcomes has one too, saying
  "not measured yet" with the evidence source it is to come from (`evidenceSources` in `.intentset/registries.yaml`),
  a baseline of `unknown`, and a target the maintainers confirm. OUT-DOCS-IMPROVE has none yet (a CORE009 warning).
  MEAS-OUTSIDE-PILOT (2026-10-21, approved by Gary the same day, under OUT-MODEL-STAYS-TRUE) is the alpha exit in `docs/implementation-plan.md`:
  an outside codebase with Intentset a required check for four consecutive weeks and a baseline that only shrank. It and
  the roadmap (`docs/roadmap.md`) never name the adopter (Gary, 2026-10-21).
  Never write a reading no source produced.
- **The gate**: the `model` job in `ci.yml` runs `pnpm run model:validate` (L2, strict mode) and `pnpm run
  model:review` (`--fail-on-drift` against the base). There is no architecture baseline: the last one, 17 VSA003
  errors of tests reaching into the conformance harness's modules, was retired on 2026-10-10, so any new violation is
  an error. A refactor answers drift with an `Intentset-Unchanged: SLICE-…` trailer.
- **Approved by a maintainer on 2026-10-15**, all but ten records: OUT-DOCS-IMPROVE waits for a measure (CORE012
  refuses an approved outcome nothing measures), and the nine rules have no verification (CORE007 refuses an approved
  rule at L3 without one). The behaviors and verifications the 0.3 changes added or revised are drafts again,
  awaiting a maintainer. A new record is a draft until a maintainer approves it; an agent never approves one.

## Status

Open work only. What shipped is in `CHANGELOG.md`, why in `docs/decisions/`, and the milestones (M0 to M5, all done)
in `docs/implementation-plan.md` §5.

- **A generated format has a version of its own** (ADR 0031, 2026-11-27): the help file, the publication index, the
  generated document's block, the snapshot file and the Atlas page's block are `0.3`, the list result `0.1`, and each
  moves only when its own shape changes, never because `intentset.spec` moved. The export moves with the
  specifications because its envelope carries `spec`. `test/tooling.test.ts` writes each version out, so a search and
  replace at the next move fails there. Do not move them when moving the specifications.
- The specifications are 0.4 and the export 0.8 on main, not yet released (ADR 0030, #158): the one breaking change
  is the renamed code, and the release that carries it says so first in its entry. A new step goes in `MIGRATIONS`
  with the codes it renames (`codes`), and a renamed code joins `RETIRED` in `test/codes.test.ts` and
  `FINGERPRINTED_AS` in `packages/architecture/src/baseline.ts`, so a baseline written before the rename still holds.
- 0.18.0 moved the specifications to 0.3 and the export to 0.7, ADRs 0023 to 0029 (issues #126, #127, #129, #130
  with #49, #142, #143 and #144). The drafts it added or returned to draft await the maintainer's approval. A migration step's per-record rewrites go in `MIGRATIONS` in
  `packages/cli/src/commands/migrate.ts`.
- Seventy records of the model are drafts: OUT-DOCS-IMPROVE waits for a measure, the nine rules for
  verifications ("Intentset's own model"), and the behaviors and verifications the 0.3 changes added or revised wait
  for a maintainer to approve them again. The measures' targets and first readings are a maintainer's.
- Architecture profiles for other stacks (#158): ADR 0030, accepted 2026-11-27, makes a profile a data file and keeps
  the language readers built in, so the check still runs no code. Done: the reader interface, and the contract
  (`spec/profile-contract.md`) with the reference profile as data and `.intentset/profile.yaml` for a team's own.
  TS007 is VSA016, which moved the specifications to 0.4 and the export to 0.8 (unreleased; `intentset migrate --to
  0.4` moves a repository). The Next.js profile (`intentset/typescript-nextjs/0.4`, the `nextjs` rule set, NEXT001 to NEXT004, `packages/architecture/src/nextjs.ts`) is in review. Next: Python. What holds now: no check recognizes a layer by its name (a rule reads the seam, pure and rendering roles
  from the profile); the Amplify checks run only where the profile names the `amplify` rule set; a profile file with
  an error stops the check with its errors and nothing else; a profile holds policy and layout, and `scope`, `areas`,
  `routerFiles`, `responseParserModules`, `schemaBridge`, `sharedBackend` and `conditions` stay in
  `.intentset/architecture.yaml`; and VSA015 judges the packages a profile lists in `outsidePackages`, of which the
  shipped profiles list none.
- The alpha exit is MEAS-OUTSIDE-PILOT: an outside codebase with Intentset a required check for four consecutive
  weeks.
- The chat answers with Sonnet 4.6 until Anthropic approves Opus 5.5 on Bedrock (`amplify/CLAUDE.md`).
