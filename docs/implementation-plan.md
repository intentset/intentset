# Intentset implementation plan

**Status:** proposed, 2026-10-02, written against the v0.1 kickoff package in `docs/requirements/` and a read of the
Markset, Streamlane and coral-reef-site repositories. Nothing here is built. Where this plan departs from the
requirements it says so and why.

Read in this order: `docs/requirements/00-kickoff.md`, the Core and VSA specifications, then this file.

## 1. What is being built

Three things, in dependency order:

1. **A reference implementation** of Core v0.1 and Traceable VSA v0.1: a parser for the Markdown-plus-frontmatter
   carrier, a typed graph, deterministic diagnostics, a JSON export, and the `intentset` CLI around them. This is
   M1–M3 of the roadmap and INT-001, INT-002, INT-003, INT-005.
2. **The Markset binding and publisher**: profile validation that is separate from Markset's own diagnostics, and the
   audience/release projection that produces Markset documents (M4, INT-004).
3. **The public site**, built from the supplied IA, copy and wireframes (INT-006).

The site does not depend on the toolchain and can be built first. The kickoff says the first increment is M0–M1; the
site is cheap with the approach below and gets the specifications in front of reviewers early, which the roadmap asks
for ("launch specifications for feedback earlier").

## 2. Technology choices

Intentset is a library, a CLI and a static site. That is Markset's shape, not Streamlane's, so the toolchain is
Markset's. Streamlane's stack (Amplify, Next.js, Mantine, pnpm, Vitest) is for a hosted multi-tenant application and
none of it is needed here; INT-007 requires independence from Streamlane anyway.

| Concern | Choice | Precedent |
| --- | --- | --- |
| Runtime | Node ≥ 22.18, TypeScript run directly by type stripping, erasable syntax only, explicit `.ts` imports | markset |
| Workspace | npm workspaces, `packages/*` + `site` | markset |
| Tests | `node --test`, no test framework | markset, coral-reef-site |
| Lint/format | Biome, `biome.jsonc` (not `.json`, comments drop members silently) | markset, streamlane |
| Types | `tsc --noEmit` for development, `tsconfig.build.json` per package for publishing to `dist/` | markset |
| Source condition | an `intentset-source` export condition listing `src` first, so the repo runs TypeScript and a consumer gets `dist` | markset's `markset-source` |
| Markdown | `@markset-lang/parser` ^0.4.1 from the registry, pinned exactly in one adapter package | coral-reef-site consumes it the same way |
| HTML output | `@markset-lang/render-html` for the publisher, Atlas and site | coral-reef-site, markset site |
| Site generator | one `site/build.ts`, every page a Markset document, `site.css` layered over `markset.css`, staging directory renamed into place | coral-reef-site (the smallest copy), markset `site/` |
| Site checks | puppeteer at 390px and 1440px: scroll width, nothing outside the viewport, link target height | coral-reef-site `test/browser.test.ts` |
| CI | GitHub Actions: lint, typecheck, build, test, conformance, packed-install smoke; Pages deploy on push to `main` | markset `ci.yml`, `pages.yml` |
| Publishing | npm trusted publishing from a `v*` tag, after one publish by hand per package | markset `release.yml` and its lessons |
| Decisions | `docs/decisions/NNNN-title.md`, one per decision, numbered | streamlane |
| Dependency policy | public, MIT/Apache-2.0/BSD/ISC only; nothing added without asking | streamlane ADR 0017, markset working rules |

Dependencies for the whole of M1–M3: `@markset-lang/parser` at runtime, `typescript` as a peer of the architecture
package (it needs a module resolver that agrees with the project's, TS005), and Biome, TypeScript, `@types/node`,
puppeteer as dev dependencies. No YAML library, no JSON Schema library, no graph library. See §4 for why.

## 3. Repository layout

```
spec/                 the normative documents, moved here from docs/requirements/specs and /profiles once accepted,
                      plus conformance.schema.json and export.schema.json. docs/requirements stays as the frozen
                      kickoff handoff. One source of truth, as spec/v0.md is for Markset.
tests/                conformance fixtures as JSON, one file per area: core.json, vsa.json, evidence.json,
                      publication.json, export.json. Written before the code that passes them (§6).
examples/scheduling/  the worked example, moved from docs/requirements/examples. It is the L1 baseline every
                      fixture mutates and the site's worked example, so it is maintained once.
packages/
  core/               carrier reader, types, graph, validator, impact traversal, export. No dependencies.
  markset-adapter/    the one place @markset-lang/* is imported. Pins the version, splits frontmatter from body,
                      lists headings, maps Markset diagnostics to origin "syntax".
  architecture/       M2: claim resolution, import graph, layer matrix, resources, exceptions, baseline.
  verification/       M3: run-record schema, freshness classification, test-reporter adapters.
  publisher/          M4: projection, provenance, generated Markset, HTML through render-html.
  atlas/              M4: static review pages over an export.
  cli/                `intentset` bin. Thin: parseArgs, file IO, exit codes, JSON reports.
  conformance/        private harness: validates tests/*.json against the schema, runs each area's driver.
  conformance-suite/  tests/ and the schemas as published data, for a second implementation. No dependencies.
  mcp/                M5: read-only context over an export.
site/                 the public site (§7).
docs/requirements/    the kickoff package, unchanged. docs/decisions/ for ADRs.
```

The roadmap says not to split publishable packages until APIs stabilise. These are workspace packages from the start
because the boundaries are the point: `core` having no dependency on Markset is what makes "metadata validation and
Markset validation produce separately identifiable diagnostics" (Core §9) structural rather than a convention, and
`conformance-suite` having no dependencies is what lets another language consume it. Publishing them is a separate,
later decision; private until then.

## 4. Design decisions to record as ADRs before M1 code

**ADR 0001, the carrier reader is Intentset's own.** Core §3 requires rejecting duplicate keys, tags, anchors,
aliases, merge keys and non-finite numbers, and limiting size and nesting. Markset's `parseYamlSubset` is a tolerant
reader for its own two keys: it lets a duplicate key win silently and keeps a flow map as raw text, which is correct
for Markset and wrong for Intentset. A general YAML library can be configured to be strict but brings a dependency
and a far larger grammar than the carrier needs. Decision: a strict reader in `core` for the subset the frontmatter
uses (block maps, block and flow sequences, quoted and plain scalars, comments), erroring on everything else with a
line number. It parses the yaml node's raw text that the adapter hands over, so Markset still owns finding the
fence. Markset's own expansion backlog
([`docs/requirements/markset/`](requirements/markset/implementation-backlog.md)) lists "duplicate key / unsafe YAML
rejected at the authoring boundary"; if that lands upstream Intentset can delegate, and until then it does not wait.

**ADR 0002, schema validation without a JSON Schema engine.** `schemas/frontmatter.schema.json` is normative for
shape, and a second implementation needs it. The reference implementation checks the same constraints in typed code
(required fields, enums, ID pattern, `additionalProperties: false`, per-type `profile` and required objects), and a
test runs both over every fixture and asserts they agree. Same move Markset makes for its conformance schema. This
avoids a dependency and gives diagnostics with field paths and remediation, which an engine's output does not.

**ADR 0003, two parse paths, one grammar.** Headings for the required-section check come from the Markset AST
(depth, text, offset), never from a regex over the body, because `#` inside a code fence is not a heading. `core`
defines the input shape (`{ path, source, frontmatterText, frontmatterOffset, headings, syntaxDiagnostics }`);
the adapter produces it. A plain-Markdown fallback is the same shape produced without Markset, which is how the
"plain Markdown fallback MUST remain readable" rule is kept honest.

**ADR 0004, diagnostics.** One shape across every package: `code`, `severity`, `origin` (`syntax` | `profile` |
`graph` | `architecture` | `evidence` | `publication` | `render`), `artifact` (ID or null), `path`, `location`
(line and column when known, absent otherwise, never invented), `field` (a JSON pointer into frontmatter when it
applies), `message`, `remediation`. Sorted by path, artifact ID, code as Core §11 requires. Exit codes 0/1/2.
Warnings are kept in the JSON report, separately.

**ADR 0005, determinism and hashing.** Canonical JSON (sorted keys, no whitespace) for anything hashed. Source hash
is SHA-256 of the file bytes. Graph hash is SHA-256 of the canonical list of `(id, type, sourceHash, authored edges)`
sorted by ID. Both from `node:crypto`. The export carries both so evidence can be bound to them (Core §8).

**ADR 0006, fixtures mutate a baseline.** A conformance case names a baseline (`examples/scheduling`), a set of file
patches, optional registries and source files, and expectations. Thirteen files per case would not be reviewed;
a patch is. The suite publishes the expanded form so a consumer needs no patch logic.

## 5. Milestones

Each milestone ends with the fixture section it names passing, and a CLI command a reader can run. Effort is the
roadmap's; it assumed one engineer and should be revised after M0.

### M0 Foundations (one week, mostly decisions)

Decisions only the owner can make, listed in §8. Engineering work in M0: repository skeleton, toolchain from §2
running `npm test` green on zero packages, CI, Biome, the ADRs in §4, the moves in §3, and the site (§7) because it
has no dependency on anything else and the kickoff wants the drafts reviewable.

Exit: `npm test`, `npm run lint`, `npm run typecheck` pass in CI; the site deploys to Pages from `main`; the eight
decisions in §8 are recorded or explicitly deferred with a date.

### M1 Core model and parser (two to three weeks)

- `core`: strict frontmatter reader; common-field and per-type checks against the schema (CORE001); ID uniqueness
  and reuse (CORE002); link resolution and endpoint types from the Core §5 table (CORE003); `parent`, `replacedBy`,
  `requires` cycles and navigation chains reaching a product (CORE004); lifecycle rules that are checkable without
  snapshots, such as `availability` required on behaviors and knowledge and registries defining the dimension values
  (CORE005, partial); required sections per type (CORE001); unattached drafts (CORE009). Derived inverse edges,
  marked derived.
- `markset-adapter`: pinned parser, the input shape from ADR 0003, syntax diagnostics passed through with
  `origin: "syntax"`.
- Export: `intentset/export/0.1` envelope per the integration contract: contract version, repository and product
  identity, source commit (from `git rev-parse`, or `null` with a reason when not in a repository), graph hash,
  generation time, validation scope and status, artifacts with ID, type, title, status, authored and derived edges,
  source path and hash, body excluded unless `--include-bodies`. Schema in `spec/export.schema.json`. This is what
  Streamlane's STL-002 imports, so its valid and invalid fixtures (unsupported version, mismatched identity) are
  written here and shared. (Shipped in 0.2 rather than 0.1, with the contract typed and renamed `intentset/export/0.2`: see "After 0.1"
  below.)
- `cli`: `intentset validate [dir] [--json]`, `intentset graph --format json`, `intentset init`. Config discovery
  from `.intentset/config.yaml` (scope globs, registries path, ignore list). A validation command never writes.
- Fixtures: `tests/core.json` covering C01–C09 plus the minimum per rule (valid, each error, each warning), and
  `tests/export.json`.

Exit: the scheduling example validates at L1 with no diagnostics (every draft piece in it is attached); every core fixture
passes; the export of the example is byte-identical across two runs and across macOS and Linux in CI.

### M2 Traceable architecture (two to three weeks, piloted on Streamlane)

- `architecture`: claim-pattern resolver (literal, `*` in a segment, `**` across segments; forbid absolute, `..`,
  braces, negation; versioned ignore list), overlap and empty-claim checks (VSA009, V05, V06); import graph from
  TypeScript's module resolution using the project's `tsconfig` (TS002, TS004, TS005: type-only, dynamic,
  re-exports and aliases all count); public-contract checks (VSA003, V02); declared-versus-observed dependencies
  (VSA004, V03); strongly connected components for cycles (VSA005, V04); layer matrix from the slice's `layers`
  and the profile's table (VSA006); region rules for shared, infrastructure, composition (V11–V13); the Amplify
  rules (AMP001, AMP002, V09, V10, V14); resource registry (V07); exceptions with expiry and visibility (VSA §9);
  unique accountable owner (VSA001/CORE006, V01).
- Migration versus strict mode: a baseline file of known violations with owner and expiry; new violations fail,
  baselined ones report.
- `cli`: `intentset architecture check [--baseline <file>] [--json]`.
- Fixtures: `tests/vsa.json`, each case a small TypeScript tree in the fixture plus the slice records, covering the
  VSA §10 list and V01–V14.

The reference profile is TypeScript + Amplify Gen 2. The checker's rule tables are data, so a second profile is a
second table, but none is planned for v0.1.

Streamlane as the pilot: it is TypeScript and Amplify Gen 2, so the reference profile applies without a second
profile, but its layout is `packages/core`, `apps/web` and `amplify/` rather than `src/features/<domain>/<slice>`.
The profile already says directory migration is not a prerequisite, so the first pilot work is writing `slice.md`
records whose claims point at the layout Streamlane has, and recording in an ADR there what the alias and layer
matrix mean in a Next.js app. Streamlane's own rules (clients never call generated model operations, the write
Lambda owns index fields, nothing outside a code-host adapter imports its SDK) are candidate `rule` and `contract`
records, and dependency-cruiser is not in that repository yet, so the import graph is this checker's to build.

Exit: the pilot's real slices resolve to unique owners with the discrepancies reported, and a deliberately illegal
import in the pilot fails CI.

### M3 Verification and impact (two weeks)

- `verification`: run-record schema per Core §8 (evidence ID, verification ID, commit, graph hash, environment,
  scope, tool or reviewer, UTC start and end, result, URI, reviewer and rationale for manual); classification into
  current pass, stale, fail, skip, error, missing, against the export's commit and graph hash; link coverage and
  current-pass coverage counted separately, manual and automated counted separately (E01–E04, CORE007).
  Adapters: one for `node --test`'s and one for Vitest's JSON reporter, keyed by the `selector` as a test title.
  Nothing invents a `describe.behavior` API.
- Impact in `core`: reverse traversal with a visited set and a recorded path and reason per hit; direct changes
  separate from candidates; ancestors for navigation.
- `cli`: `intentset evidence import <file>`, `intentset impact <ID>`, `intentset review` (the local report:
  validation, ownership, coverage, impact of uncommitted changes against `HEAD`).
- Fixtures: `tests/evidence.json`.

Exit: a rule change in the pilot shows its dependent behaviors, owners, verifications and knowledge in `review`, and
a pass recorded against the previous graph hash reads as stale.

### M4 Markset knowledge and Atlas (two to three weeks)

- `publisher`: deny-by-default projection (visibility, audience, product, release, role, edition, flags; draft and
  retired excluded; P01–P06); provenance block per published document (source IDs, revisions and hashes, snapshot,
  audience, availability, reviewer, timestamp) as frontmatter under a derived marker; `needs-review` when a source
  changed after the knowledge's review; a reference to an excluded source fails without naming it (P02). Output is
  Markset source first, then HTML through render-html. Profiles stay metadata only: no new directive, which is a
  test over the output.
- `atlas`: static pages over an export, built the way the site is built: product and capability overview, behavior
  detail, ownership, verification status, publication readiness, every count carrying snapshot, denominator and
  whether it measures links or evidence.
- `cli`: `intentset publish --audience <a> --release <r> --out <dir>`, `intentset serve`.
- Fixtures: `tests/publication.json`.

Exit: public, customer and internal projections of the pilot differ as the fixtures say, and the customer projection
contains no internal title or path, checked by grepping the output for every internal artifact's title.

### M5 Agent context and alpha (one to two weeks)

- `mcp`: read-only, over an export file, with the same projection rules; customer context reads the publication
  index, never the engineering graph. `intentset context <ID>` is the same code on the CLI.
- Packaging: `npm run build` to `dist/`, packed-install smoke test, first publish by hand per package, trusted
  publishers configured, then `release.yml`.
- The adoption guide on the site replaces "no installation command exists" with the real one, and only then.

Exit: the roadmap's definition of alpha done, with an external adopter.

### After 0.1: what the export's consumers need (0.2, 2026-10-03)

0.1 shipped every milestone but left the export's report slots untyped and no fixture for a consumer, which is what
Streamlane's integration (its increments 1 to 5) and Driftline (errors and usage attributed to slices) wait on.
0.2 closes that, recorded in ADR 0008 and `spec/export.md`:

- The contract is `intentset/export/0.2`: typed `evidence`, `knowledge`, `impact` and `ownership` reports, each built
  by the package that owns the check and asked for with `intentset graph --report`; restricted artifacts withheld and
  counted unless `--include-restricted`; `source.uncommitted`.
- `readExport` in `@intentset/core` makes every check spec/export.md §5 asks of a consumer, and 16 consumer cases in
  `tests/consumer/` (shipped in the suite's `consumer/`) cover each rejection category and the states a consumer must
  show: not supplied, stale, failing validation, withheld.
- VSA §3: a draft slice's missing entrypoint and empty claims are warnings, so a product modelled before it is coded
  keeps L2 green. Driftline is the first.

What stays with the consumers: their read models, authorization per reader, atomic promotion, idempotent re-import
and the screens, in their own repositories and under their own rules.

### After 0.4: help in the product (2026-10-04)

The knowledge a product shows inside its own interface, a tooltip on a control or a panel for a page, had no place in
the model, and words typed into an interface are the documentation that goes stale first. ADR 0011 gives it one:

- `tips` on knowledge records (Core §9), one sentence per explained ID, gated by everything that gates the record.
- `help.json` beside every publication (publication §5), and `@intentset/help`, a dependency-free runtime that binds
  tips to elements carrying `data-behavior` and reports what has no tip yet.

What stays with Driftline: when a person sees help beyond hover, chat over the published knowledge, and whether a tip
moved anyone to the next behavior. The `data-behavior` binding is the usage event it meters, so a product instrumented
for help is instrumented for adoption.

### After 0.4: success measures (2026-10-04)

The model could say why a change was made and whether it was built as described, and not whether building it worked.
ADR 0012 adds the record that says so:

- `measure`, the thirteenth type, under an outcome (Core §2, §5, §6): metric, baseline or `unknown`, target, window,
  a `source` from the new `evidenceSources` registry, and a Method section. An outcome past draft needs one.
- Core §6 separates verification (was the behavior built right) from measurement (did it produce the outcome), and
  Core §8 names the outcome evidence record a later version will read, so Driftline designs against the words.
- Export 0.3: the type, the registry, and `measure` and `tips` on every artifact.

What stays outside Intentset: collecting telemetry, running the query, computing the metric, the dashboard. The
registry names the systems that do, and a reading comes back to the measure record as evidence when that record exists.

## 6. Conformance fixtures

Markset's rule applies: no check ships without its cases, and the cases are written first. Format, in
`spec/conformance.schema.json`:

```json
{
  "section": "core",
  "name": "C03 governedBy targets a capability",
  "baseline": "scheduling",
  "patch": { "BEH-ASMT-SCHEDULE.md": { "intentset.links.governedBy": ["CAP-ASMT-ASSIGN"] } },
  "valid": false,
  "diagnostics": ["CORE003"]
}
```

A case may also carry `files` (whole documents), `sources` (TypeScript files for VSA cases), `registries`, `evidence`
(run records) and `request` (a publication request), and may pin `export` (the expected envelope) the way Markset
pins `ast`. The harness reports an aspect it cannot yet evaluate as skipped, so cases can precede code. The
published suite expands patches into whole files.

Coverage required per check code: one passing case, one failing case per condition in the spec's sentence, one case
at the boundary (an empty array, a self-reference, a draft where the rule only binds non-drafts).

## 7. The public site

Built in M0, exactly as coral-reef-site is built, with Markset's site as the fuller reference for navigation and a
rail.

- Pages: `/`, `/start/`, `/specifications/` with the three normative documents rendered under it, `/markset/`,
  `/roadmap/`, `/about/`, `/example/` rendering `examples/scheduling/` as linked pages. Copy is
  `site/06-intentset-information-architecture-and-copy.md`, moved into `site/content/*.md` verbatim; layout is
  `wireframes/intentset.html` at 760px and below as well as desktop. The normative documents and the example are
  rendered from their single source, so the site cannot drift from the specification.
- Every page is Markset rendered by `@markset-lang/render-html`; `site/site.css` is layered over `markset.css`.
  No script inside `<main>`; the site needs no script at all.
- Tests: build into a temporary directory; puppeteer at 390px and 1440px for horizontal overflow, elements outside
  the viewport and link targets under 44px; every internal link resolves; one `h1` per page; skip link present; no
  page contains the words "install" or "npm" until M5 flips that test; the nav has the four items the IA names.
- CTAs: "Read the draft specification" and "Explore an example" link internally. "Contribute on GitHub" and the
  Coral Reef link are gated on §8 decisions, as the copy says.
- Deploy: `pages.yml` on push to `main`. `CNAME` only once a domain is confirmed; until then the Pages URL.
- `docs/requirements/wireframes` is excluded from Biome, as coral-reef-site excludes its own.

## 8. Decisions only the owner can make

| # | Decision | Why it blocks | Suggested default |
| --- | --- | --- | --- |
| 1 | Code license | LICENSE goes in the first commit; CONTRIBUTING depends on it | Apache-2.0 for code as the roadmap suggests; Markset chose MIT, and matching it is also defensible |
| 2 | Specification and schema license | The suite is published for other implementations | CC BY 4.0 for prose, same license as code for schemas and fixtures |
| 3 | GitHub organisation and repository | `package.json` `repository` feeds the site and the manifests | **Decided:** `intentset/intentset` |
| 4 | npm scope | Markset's lesson: `@markset` was taken and npm answered 404, not 403 | **Decided:** `@intentset`, the organisation is owned |
| 5 | Domain | `CNAME` and `homepage` | **Decided:** intentset.org, owned; `homepage` in `package.json` and `CNAME` written from it, as Markset does |
| 6 | The pilot | M2 and M3 need real slices, tests and owners | **Decided:** Streamlane. Its product records live in that repository and `intentset validate` runs in its CI; nothing from it enters this repository (INT-007 is about runtime independence, not about who pilots) |
| 7 | Whether `spec/` becomes the source of truth | §3 moves the specifications and example out of the frozen handoff | Yes, in M0, with `docs/requirements` left as delivered |
| 8 | Markset upstream work | Markset's expansion backlog ([`docs/requirements/markset/`](requirements/markset/), moved here from Markset's `docs/expansion-requirements` 2026-10-05) proposes a profile hook and strict carrier rejection | Intentset does not wait for either; the adapter package is where delegation happens later |

## 9. Risks and how the plan answers them

- **Checking too little and calling it conformance.** The VSA checker cannot see dynamic imports or prove a module
  is business-neutral. Every unresolvable check reports `unresolved`, never `pass`, and reports carry "with
  exceptions" when a waiver exists (VSA §2, Core §11).
- **Markset drift.** One adapter package, one exact version, and a test that renders every example and compares to a
  pinned output, so a Markset release that changes rendering fails here rather than on the site.
- **The site claiming more than exists.** The copy says tools are planned; a test holds the words that would say
  otherwise until M5. Maturity labels are in the copy, not computed.
- **Coupling to Streamlane.** It is both the pilot and the first consumer of the export, which makes it easy to let
  its needs leak into `core`. `core` imports nothing, the pilot's records stay in the Streamlane repository, and the
  export schema is reviewed against the integration contract rather than against Streamlane's read model (INT-007).
- **A second parser for frontmatter.** The reader in ADR 0001 is deliberately small and rejects rather than
  interprets anything outside its subset. Its fixtures are the unsafe-YAML cases in the catalog and nothing else.

## 10. First week, concretely

1. Record decision 1 from §8 (3, 4, 5 and 6 are made; 2, 7 and 8 have defaults).
2. Scaffold: root `package.json` with workspaces and the Markset script set renamed, `tsconfig.json`,
   `tsconfig.build.json` template, `biome.jsonc`, `.github/workflows/ci.yml`, `CLAUDE.md` with the invariants
   (one carrier, authored forward edges only, fail-closed publication, no new directives, diagnostics are
   specified behaviour, fixtures before code, no dependencies without asking).
3. Move specs to `spec/`, the example to `examples/scheduling/`, write ADRs 0001–0006.
4. Write `tests/core.json` from C01–C09 and the Core §4–§6 rules, and `spec/conformance.schema.json`.
5. Build the site and deploy it to Pages.
6. Start `core` with the carrier reader, against its fixtures.
