# Changelog

Every release of the `@intentset/*` packages, newest first. Each entry says whether the specifications, the
conformance suite or the export contract moved, because those are what another tool pins. Core §1 says what kind of
change a revision is; while the specifications are drafts, the next change that invalidates an existing conformance
case moves `intentset.spec` from `0.1`.

## Unreleased

**A changelog, a change policy, and specifications that say what they are.** The specifications changed in wording
and in what they document, not in what any check does: no case changed, `intentset.spec` stays `0.1`, and the export
stays 0.3.

- **This changelog**, backfilled from 0.2.0, and a test that requires an entry for the version in `package.json`.
- **A change policy in Core §1**, with one line in the export contract's §7. The suite decides what kind of change a
  revision is, and the next change that invalidates an existing case moves `intentset.spec` to `0.2`. Core §1 also
  lists the one breaking revision made inside `0.1` so far, on 2026-10-04 (see 0.6.0).
- **Each specification opens with frontmatter**: `title`, `id`, `status`, `revision` and `implementation`. The site's
  banner on each specification and the cards on the specifications index are rendered from it, and a test holds the
  title to the heading, the implementation to `package.json` and the revision to a real date. Core's handwritten
  header still said 2026-10-02 two revisions later.
- **The specifications document every code the implementation reports.** CFG001, CFG002 and EVID001 to EVID003 are
  in Core §11, VSA013 in VSA §2 and §9, and REG001, the structural region-boundary code, in VSA §5. Each code that is a
  review assertion no tool reports (AMP003, AMP005, AMP012, AMP013, TS005, VSA007, VSA008, VSA010 to VSA012) says so
  where it is defined. Core §11 now lists `origin` among a diagnostic's fields, with its seven values. A test holds the
  codes in the specifications equal to the codes in the suite plus that declared list, and every code the
  implementation reports to one a specification names.
- **Stale text is gone from the specifications.** They no longer call the shipped CLI, Atlas, publisher and MCP server
  implementation targets, the Markset pin provisional, or the CLI's exit codes proposed, and the handoff's references
  to an earlier conversation are replaced with the reasons they stood for.
- **`intentset guide`** prints the agent guide for the repository it runs in, the same text `init` writes to
  `.intentset/agents.md`, without writing anything. The guide now says that records are Markset documents and points
  at Markset's own guide, https://markset.org/guide.md, for the syntax, as does the remediation on every Markset
  diagnostic the adapter passes through.
- **A README for every published package**, with keywords, so the npm page says what each package is. Tests require
  a README naming each published package and the root README to name all ten.

## 0.6.1 — 2026-10-05

**An export carrying a Markset diagnostic is no longer rejected as malformed.** The export stays 0.3, as a defect
fix; the conformance schema accepts Markset's codes and gains one core case and one consumer fixture; Core §11 and
the export contract's §1 and §7 say why. Consumers must upgrade `@intentset/core` to 0.6.1; their export pin stays
0.3.

- **Markset's codes in exports.** `@intentset/markset-adapter` passes Markset's diagnostics through with their own
  codes, such as `COLUMNS_SINGLE`, under origin `syntax`. The export schema, the conformance schema and `readExport`
  accepted only `AREA###` codes, so one Markset warning in one record made a consumer reject the whole export. The
  code's shape is now keyed on its origin: `syntax` takes Markset's `AREA_NAME`, and every other origin keeps
  `AREA###`. A reader on `@intentset/core` 0.6.0 or earlier still rejects these envelopes.
- **Cases about what Markset reports** carry `carrier: "markset"`, so the harness reads their documents through the
  adapter; core's own run skips them, since core parses no Markdown.
- **The tests, the suite and the installed packages also run under micromark's development build**, which Vite,
  Vitest and Next resolve by default and which asserts what the production build does not. Markset 0.3.3 passed every
  production run and threw on any link under it.
- **`intentset --version`** prints `intentset <version>`, the checker version a report names.

## 0.6.0 — 2026-10-04

**Success measures as records under outcomes, and the export at 0.3.** Core changed, with one breaking revision inside
`0.1`: an active outcome must now have a measure (CORE003), so a repository that validated on 2026-10-03 with an
approved outcome and no measure fails from this release. The suite gained fifteen core cases and a rejected 0.2
consumer envelope, and its baseline graph hash changed. The export moved from 0.2 to 0.3.

- **`measure` is the thirteenth artifact type** (ADR 0012, Core §2, §5, §6, §8). A measure judges one outcome, its
  `parent`, with a `measure` block (metric, baseline or `unknown`, target, window, a `source` from the new
  `evidenceSources` registry, optional direction) and a Method section.
- **Breaking, Core 0.1 revision 2026-10-04: an outcome past draft needs a measure** (CORE003); while it is draft, a
  missing measure is a CORE009 warning. Add a measure under each approved outcome, or the repository fails L1. Verification is not success: Core §6 says so, and §8
  names the outcome evidence record a later version will read.
- **Export 0.3** carries the type, the registry, and `measure` and `tips` on every artifact. A 0.2 reader would reject
  an envelope naming a type it did not know, so the version moved. Consumers must move their pin to 0.3 and upgrade
  `@intentset/core` to read it.
- **The import extractor reads JSX as JSX**, so a slash in JSX text is no longer an unterminated regular expression,
  and `//` in JSX text no longer hides an import later on its line. Found as three TS004 warnings in Streamlane.
- **Markset 0.4.1**, pinned exactly as before. Its indentless-sequence fix let the adapter drop its
  `FRONTMATTER_UNPARSEABLE` workaround.
- **SECURITY.md**: report vulnerabilities privately to security@coralreefventures.com.

## 0.5.0 — 2026-10-04

**Tips for the product's own interface, and the help file a product binds them from.** Core §9 and the publication
profile's new §5 changed additively: `tips` is optional, and no existing case changed. The suite gained eleven core
and four publication cases, and `published.mustContain` in its schema. The export stayed 0.2.

- **`tips` on knowledge records** (ADR 0011): one plain sentence per explained ID, at most 160 characters, reviewed
  and published with the record. A key outside `links.explains` is CORE003; a malformed tip is CORE001.
- **`intentset publish` writes `help.json`** beside the documents, every published tip keyed by the ID it explains.
- **`@intentset/help`, a tenth package**, the browser runtime a product binds tips with: `readHelp`, `tipFor`,
  `helpForPage` and `bindTips`. No dependencies.
- **The repository builds, tests and releases with pnpm**, and `init` writes the agent guide with `pnpm exec` in a
  repository that uses pnpm and `npx` elsewhere. `markset-adapter` now declares the mdast types its declarations
  import, which npm's flat layout had hidden.

## 0.4.0 — 2026-10-04

**Agents keep the model current.** Core §10 gained the review of drift between code and records, which is new and
SHOULD-level, so no case changed. The suite and the export (0.2) did not move.

- **`init` writes `.intentset/agents.md`** (ADR 0010), the guide a coding agent follows: load the owning slice before
  editing, update the records in the same commit, never self-approve. `init --agents` writes it alone in a repository
  already set up.
- **`intentset context <path>`** resolves a file to the slice that claims it and returns that slice's context.
- **`intentset review` lists each slice whose code changed while none of its records did.** A refactor answers with
  an `Intentset-Unchanged: <slice ID>` commit trailer, and `--fail-on-drift` fails CI on anything left unanswered.

## 0.3.0 — 2026-10-03

**Areas, for a backend past CloudFormation's limits.** The reference profile gained §9, additively: nothing applies
to a repository that declares no areas. The suite gained twelve VSA cases; Core and the export (0.2) did not move.

- **A backend may split into areas** (ADR 0009), each its own Amplify backend and schema, joined by one AppSync Merged
  API reached through one client: `areas`, `sharedBackend` and `schemaBridge` in `.intentset/architecture.yaml`.
- **AMP007 to AMP011 are checked from source**: a slice's domain names its area, area backends do not import each
  other, each model and operation is declared in one area, no relationship names another area's type, and only the
  schema bridge calls `generateClient`. AMP012 and AMP013 are review assertions. Schema members are read from
  TypeScript's scanner tokens, as imports are.

## 0.2.0 — 2026-10-03

**Export 0.2, the first contract a consumer may pin, and draft slices that plan their paths.** The export moved from
0.1 to 0.2. VSA §3 relaxed two errors to warnings for draft slices, so no repository that conformed stopped
conforming; one existing case was patched to keep its outcome. The suite gained three VSA and two export cases and
sixteen consumer cases.

- **Export 0.2** (ADR 0008, `spec/export.md`): typed evidence, knowledge, impact and ownership reports, asked for
  with `intentset graph --report`; restricted artifacts withheld and counted unless `--include-restricted`;
  `source.uncommitted`.
- **`readExport` in `@intentset/core`** makes every check a consumer must: contract, shape, identity, snapshot
  agreement, withholding and consistency. Its shape checks agree with the schema on every single-node mutant of a real
  envelope.
- **Consumer fixtures** in `tests/consumer/`, shipped in `@intentset/conformance-suite`: an envelope a consumer must
  accept or reject for each rejection category and each state a consumer must show.
- **Draft slices plan their paths** (VSA §3): while a slice is draft, a missing entrypoint (VSA002) and a claim that
  matches no file (VSA009) are warnings, so a product modelled before it is coded keeps L2 green.
