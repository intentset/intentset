# Intentset

Intentset keeps product intent, observable behavior, implementation ownership, verification and published knowledge
connected, as readable Markdown files with YAML frontmatter in a repository. The graph, reports, Atlas and published
knowledge are derived views; the files are authoritative. This repository is the v0.1 specifications, the conformance
suite, the reference implementation in TypeScript, and the intentset.org site.

**`spec/` is the source of truth**: `core-0.1.md`, `vsa-0.1.md`, `profile-typescript-amplify-gen2-0.1.md`,
`frontmatter.schema.json`, `conformance.schema.json`, `export.schema.json`, `evidence.schema.json` (run records). Read the Core spec before implementing
anything. When code and spec disagree, the spec wins, or the spec changes first in the same commit.
`docs/requirements/` is the kickoff handoff as delivered and is not updated; `docs/implementation-plan.md` is the plan;
`docs/decisions/` holds the ADRs.

## Design invariants

1. **One carrier, one record per artifact.** Markdown with YAML frontmatter under `intentset:`. Tools never merge
   duplicate records and never rewrite files. Unknown keys inside `intentset` are errors except under `extensions`;
   unknown top-level keys are preserved and never interpreted.
2. **Authored forward edges only.** Relationships are written once in the Core §5 direction; every inverse is
   derived and marked derived. A reverse edge in a file is a mistake, not a convenience.
3. **Definitions are not evidence.** A verification record says how a claim is checked. Only a `pass` at the assessed
   commit and graph hash is current; stale, skip, error, fail and missing never count as pass, and link coverage and
   current-pass coverage are always reported separately.
4. **Publication fails closed.** Deny by default, intersect every availability dimension, exclude draft and retired,
   never leak an excluded source's title or path. Documentation metadata never grants runtime access.
5. **Profiles are metadata, not syntax.** No `:::behavior`, no new Markset directive, ever. Markset owns the document
   grammar; Intentset owns meaning. Markset diagnostics (origin `syntax`) and Intentset diagnostics (every other
   origin) are never mixed into one list without the origin field.
6. **Checks report what they could not check.** `unresolved` is never `pass`. A waiver produces "with exceptions",
   never unqualified conformance. Every count names its snapshot, denominator and whether it measures links or evidence.
7. **No code execution, no network, no mutation** in `validate`, `graph`, `architecture check`, `impact`, `review`.
   Publication and serving are separate explicit commands.
8. **`@intentset/core` has no dependencies.** Everything Markset is in `@intentset/markset-adapter` and nowhere else.
   `@intentset/conformance-suite` has no dependencies either: it is what another implementation is checked against.

## Working rules

- **Fixtures before code.** A check ships with its cases in `tests/<section>.json`: one passing case, one failing case
  per condition in the spec's sentence, one boundary case. Catalog IDs (C01, V02, E03, P04) prefix the case name.
- **Spec, fixtures and implementation change in the same commit.**
- Diagnostics are specified behavior: code, severity, origin, artifact, path, location when known, field as a JSON
  pointer, message, remediation. Sorted by `compareDiagnostics`. Codes are stable within v0.1.
- Determinism: same inputs, same bytes. Canonical JSON for anything hashed. Sort everything you iterate.
- Don't add dependencies without asking. Approved so far: `@markset-lang/parser` and `@markset-lang/render-html` at
  exactly 0.3.4 (adapter, publisher, atlas, site), `@modelcontextprotocol/sdk` (mcp only), `typescript` as a peer of
  architecture, Playwright and Biome as dev dependencies. `npm install` is run by whoever owns the root; agents working
  in parallel do not run it.
- Nothing from the Streamlane pilot enters this repository. Its records live in the Streamlane repository.
- The example product is Lantern, invented. Nothing in this repository names a real product.

## Core API (the contract every package builds against)

```ts
// @intentset/core
parseYaml(text): { value: Record<string, unknown>; error: null } | { value: null; error: { message; line } }  // strict, ADR 0001
plainCarrier(path, source): DocumentInput                     // plain-Markdown fallback, ADR 0003
readArtifact(input: DocumentInput): { artifact: Artifact | null; diagnostics: Diagnostic[] }   // CORE001, origin "profile"
readRegistries(text, path): { registries: Registries; diagnostics: Diagnostic[] }
readConfig(text, path): { config: Config; diagnostics: Diagnostic[] }   // Config = { repository, scope[], registries|null, ignore[] }
validate(inputs: DocumentInput[], registries: Registries, options?: { level }): ValidationResult   // the whole L1 pipeline
impact(graph: Graph, id: string): ImpactReport
exportGraph(result: ValidationResult, registries, meta): ExportEnvelope
graphHash(graph): string; canonicalJson(value): string; sha256Hex(input): string
sortDiagnostics, compareDiagnostics, hasErrors, and every type in types.ts
```

```ts
// @intentset/markset-adapter
MARKSET_VERSION = "0.3.4"
marksetCarrier(path, source): DocumentInput      // same shape as plainCarrier; a test asserts they agree on every example
```

## Conventions

- Diagnostic codes: `CORE001`–`CORE009` (Core §11), `VSA001`–`VSA012`, `TS001`–`TS006`, `AMP001`–`AMP006` (VSA §2,
  profile §2, §4), `EVID00n` for evidence, `PUB00n` for publication, `CFG00n` for configuration. Three digits always.
- Package layout: `packages/<name>/src/index.ts` is the public surface; `test/*.test.ts` with `node --test`;
  `tsconfig.build.json` extends `../../tsconfig.build.base.json`.
- Site output uses Markset's `ms-` classes and `site/site.css` layered over `markset.css`. No script inside `<main>`.
- Commit messages are one plain sentence saying what changed and why, as in Markset.

## Layout

```
spec/                 normative documents and schemas
tests/                conformance fixtures, one JSON file per section (core, export, vsa, evidence, publication)
examples/scheduling/  the worked example, the fixtures' baseline and the site's example
packages/
  core/               carrier reader, types, graph, validator, impact, export. No dependencies.
  markset-adapter/    the one Markset import
  architecture/       M2: claims, import graph, layers, resources, exceptions, baseline
  verification/       M3: run records, freshness, reporter adapters
  publisher/          M4: projection and generated Markset
  atlas/              M4: static review pages over an export
  cli/                `intentset`
  conformance/        private harness
  conformance-suite/  published cases and schemas as data
  mcp/                M5: read-only context server
site/                 intentset.org
docs/                 implementation-plan.md, decisions/, requirements/ (frozen handoff)
```

## Toolchain

- Node ≥ 22.18, TypeScript run directly by type stripping: erasable syntax only, explicit `.ts` import extensions.
- npm workspaces. `npm test` (node --test), `npm run conformance`, `npm run typecheck`, `npm run lint`,
  `npm run format`, `npm run site`, `npm run site:watch`, `npm run build` (publishing only, to `dist/`).
- Every published manifest lists the `intentset-source` export condition first, pointing at `src`, so this repository
  runs TypeScript while an installed consumer gets `dist`.
- Biome config is `biome.jsonc`, deliberately not `.json`.
- The site's browser checks run Playwright (Chromium) at 390px and 1440px.

## Status

See `docs/implementation-plan.md` §5 for milestones. Update the list below as milestones land.

- [x] M0 scaffold, specs in `spec/`, example in `examples/`, ADRs 0001–0006, the site
- [x] M1 core: strict carrier reader, typed graph, validator (CORE001–CORE006, CORE009), impact, export, `contextFor`;
      `tests/core.json`, `tests/export.json`
- [x] M2 architecture: claims, import graph from TypeScript 7's scanner (ADR 0007), regions, layers, exceptions,
      baseline, monorepo resolution; `tests/vsa.json`
- [x] M3 verification: run records, freshness, coverage, Vitest and node TAP adapters; `tests/evidence.json`
- [x] M4 publisher (`spec/publication.md`, `tests/publication.json`) and Atlas
- [x] M5 read-only MCP server; the CLI with every command; packed-install smoke test; release workflow
- [x] Streamlane pilot (Streamlane ADR 0033, branch `intentset-pilot`); findings in `docs/pilot-findings.md`
- [ ] Not published. Each package needs one manual `npm publish` and its trusted publisher configured before CI can
      release it (see the release workflow's comment). The site's install-claims test flips only after that.
- [ ] Four open specification questions from the pilot, `docs/pilot-findings.md`: a slice's surface across packages,
      scope hiding consumers, where evidence lives, and draft gaps at L3.
- [ ] The Markset adapter drops FRONTMATTER_UNPARSEABLE until Markset releases the indentless-sequence fix
      (Markset commit 3601c8c) and the pin moves past 0.3.4; a test removes the workaround with the bump.

Run evidence is never committed: a pass counts only at the commit and graph hash it ran against, so a committed record
is stale on arrival. Keep `.intentset/evidence/` out of git (CI artifacts, or an external store).
