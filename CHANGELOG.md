# Changelog

Every release of the `@intentset/*` packages, newest first. Each entry says whether the specifications, the
conformance suite or the export contract moved, because those are what another tool pins. Core §1 says what kind of
change a revision is; while the specifications are drafts, the next change that invalidates an existing conformance
case, in any section of the suite, moves `intentset.spec` (it moved from `0.1` to `0.2` on 2026-10-14, and from `0.2` to `0.3` in 0.18.0, on 2026-11-27).

From 0.18.0 an entry opens with a summary of one short line per change, each pointing to its ADR or issue, grouped
under the headings of [Keep a Changelog](https://keepachangelog.com): `### Breaking` first, with what an adopter must
do, then any of `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed` and `### Security` that apply.
Before 1.0 a minor release may break things, so Breaking is what to read first. `### Details` follows with the
paragraphs that say what moved: the bold sentence, then whether the specifications, the suite and the export moved.
Earlier entries have only that detail. `pnpm run release:prepare` refuses an Unreleased entry with no summary or with
another `###` heading, `pnpm run release:notes <version>` prints an entry's body, the release workflow uses it for the
GitHub Release, and intentset.org's Changelog page and feed are built from this file.

## Unreleased

### Added

- **The agent guide shows a slice's frontmatter**, with every required key, beside the behavior's (#169).
- **A repository can write its own architecture profile**, `.intentset/profile.yaml`: its layers by its own names, their roles, the matrix and the rule sets that run, extending a profile Intentset ships. The profile contract is a new specification, and the plain TypeScript profile `intentset/typescript/0.3` ships beside the reference one (ADR 0030, #158).
- **VSA015: a package a profile lists in `outsidePackages` is imported only from the seam layer, and never from a pure layer.** A portable rule, under every profile; both shipped profiles list none, so nothing is reported until a repository lists one (VSA §5, ADR 0030, #158).
- **`@intentset/architecture` exports its reader interface** (`Reader`, `Reading`, `typescriptReader`, `READERS`): the part of the check that knows a language, the first step toward profiles for other stacks (ADR 0030, #158).

### Fixed

- **`intentset review` refuses a base that shares no history with HEAD**, as a shallow fetch leaves it, with exit 2, where it reported nothing changed and passed (#156).
- **A slice missing `layers` or `usesResources` is told to write `layers: {}` or `usesResources: []` where there are none**, and never to invent a layer (#170).

### Details

**`intentset review` exits 2 when its base shares no history with HEAD, and a first slice can be written from the agent guide (#156, #169, #170).** Patch: no specification, conformance case or export moved. `review` ran `git diff <base>...HEAD`, which fails when the two have no common ancestor, and read the failure as no committed change, so `--fail-on-drift` passed a shallow CI checkout whatever it changed; it now stops before writing a review and says to fetch the full history. The guide `intentset init` writes gains a slice template whose six required keys include `layers: {}` and `usesResources: []`, which VSA §3 already allowed, and CORE001's remediation for either key missing says so; neither the check nor its message changed.

**The architecture check reads TypeScript through a reader, an interface of three questions: which files are source, what each imports, and where each specifier resolves (ADR 0030, #158).** Patch: a refactor, with no specification, conformance case or export moved and no diagnostic changed. `checkArchitecture` and the subject source ask the model's reader where they called the TypeScript extractor and resolver directly, and `buildModel` takes a reader as an optional last argument. Only the TypeScript reader exists, so nothing a repository can configure has changed.

**A profile is a file a team writes, under a contract of its own, and the reference profile is one such file (ADR 0030, #158).** Minor: a new specification, `spec/profile-contract.md` (`intentset/profile-contract/0.1`), one new rule in VSA §2 and §5, VSA015, and 45 new cases in the VSA section of the suite, named `PROFILE …` and `VSA015 …`; the reference profile and the export did not move, every existing case passes unchanged, and `intentset.spec` stays `0.3`. With no `.intentset/profile.yaml` a repository is checked exactly as before. The check resolves its configuration in one order, each source replacing a key whole: the shipped profile, the profile file, `.intentset/architecture.yaml`, the caller. No check recognizes a layer by its name any more: the seam, pure and rendering roles are read from the profile, where the reference profile gives them to `external`, to `policy` and `model`, and to `presentation`. AMP001 to AMP013 run only where the profile names the `amplify` rule set, which the reference profile does and the plain TypeScript profile does not. A profile file with an error is CFG001 for each thing wrong and stops the check: it is never applied in part, no other profile stands in for it, and nothing else is reported. A profile holds policy and layout, so `scope`, `areas`, `routerFiles`, `responseParserModules`, `schemaBridge`, `sharedBackend` and `conditions` are each an error in one and stay in `.intentset/architecture.yaml`, which accepts everything it did, and `outsidePackages`. VSA015 gives the seam and pure roles meaning under every profile: an import of a listed package from a pure layer, or from a slice file outside the seam, is an error, and a role no layer plays judges nothing. `@intentset/architecture` adds `loadConfig`, `readProfile`, `shippedProfile` and the profile constants, and the resolved configuration gains `profile`, `language`, `layers`, `roles`, `layerFolders`, `ruleSets` and `outsidePackages`; `.intentset/profile.yaml` is a file the CLI reads, so no output may be written over it.

## 0.18.0 — 2026-11-27

### Breaking

- **Every record moves to specifications `0.3`, and the export to `0.7`.** Run `intentset migrate --to 0.3` in each repository (from `0.2` or `0.1`), then run the suite again: migration re-pins no run record, so every subject-bound pass is stale until it does. A `0.2` record is CORE001 and a 0.6 export is `unsupported-contract`. Tools that read the export or `help.json` should read export 0.7 and `docs/consumers.md` (ADRs 0023 to 0029, #153).
- **`implemented` and `released` are no longer statuses.** `status` is the review lifecycle and `delivery` says what exists; `migrate` rewrites both to `approved` with `delivery: built` (ADR 0023, #126).
- **A knowledge review is the core field `review`, and `extensions.intentset.org/review` is CORE001.** `migrate` moves it and re-pins every pin that matched; pins hash content by default (ADR 0025, #130).
- **Diagnostic codes changed: CORE010, CORE011, CORE012 and CORE013 are new**, and conditions that were CORE001 or CORE003 report them instead (ADR 0024, #129).
- **`evidence.resources` and `evidence.dependencies` are removed**; a configuration that sets either stops with CFG001, so delete the key (ADR 0026, #127).
- **`help.json` is `intentset/help/0.3` and the publication index `intentset/publication-index/0.3`**; `readHelp` refuses a `0.2` file, and `audience`, `role` and `flags` are always lists (ADR 0029, #144).
- **`bindTips` no longer sets `title`.** A product that relied on it passes a `render` that shows the tip (#145).

### Added

- **`intentset migrate --to 0.3` and `intentset approve --renew-review`**: the one upgrade step, and a way to renew a knowledge review without returning it to draft (ADRs 0022 and 0025, #153).
- **Knowledge whose sources changed can be published, marked under review**, with `keepUnderReview` (ADR 0027, #142).
- **A slice says which knowledge leads each surface of a product** (`slice.surfaces`), and the help file maps surfaces to articles (ADR 0028, #143).
- **A publication request may name every audience and role its reader holds** (ADR 0029, #144).
- **`watchTips` in `@intentset/help`** keeps tips bound as the page changes and puts the page back on `dispose` (#145).
- **`renderHtml: "fragment"` and `intentset publish --html=fragment`** write a document without the page around it (#146).
- **The Atlas opens on the product as a tree, traces each behavior, lists what needs attention and lays its map out in layers**; `@intentset/cli` exports `atlasOf` and `openSession` (#159).
- **`intentset init --example` writes the online shop, with its code and tests**, in place of Lantern (#161).
- **Records may declare `markset: true`**; `markset: 0` stays valid and means the same (#153).

### Changed

- **`@markset-lang/*` is pinned at exactly 0.6.0**, and everything Intentset writes declares `markset: true` (#153).
- **A `content-v1` pin hashes `markset: true` as `markset: 0`**, so moving a source between the two keeps its reviews current (#153).

### Removed

- **The Atlas's overview page**: its totals are on the product page (#159).

### Fixed

- **`intentset review` reads a base at an earlier version as migrated**, so a migration's pull request no longer lists every record as newly approved (#153).
- **`intentset migrate` reads past comment lines, and quoted or spaced keys, in a record's frontmatter**, checks each rewrite as YAML and names a record it could not rewrite (#153).
- **The Atlas says why a deprecated record's delivery is `built`** (#153).

### Security

- **Published pages and fragments carry only `http`, `https`, `mailto` and scheme-less links and images**, where `javascript:` links reached the page before (#146).
- **The engineering MCP server withholds a restricted ID in a knowledge record's `tips` and a verification's `exercises`** (#153).

### Details


**0.18.0 moves the specifications to `0.3` and the export to `0.7`: `status` is the review lifecycle and `delivery` says what exists (ADR 0023), a diagnostic code names one kind of thing to fix (ADR 0024), a knowledge review is the core field `review` and pins content hashes (ADR 0025), a subject is computed one way (ADR 0026), knowledge whose sources changed can be published kept under review (ADR 0027), a slice says which knowledge leads each surface of a product (ADR 0028), and a publication request may name every audience and role of its reader (ADR 0029); `@intentset/help` keeps tips bound with `watchTips`, and a published document can be rendered as an HTML fragment that carries only safe URLs.** Breaking: every record's `spec` and `profile` move, and `intentset migrate --to 0.3` is the one upgrade step (from `0.2`, or from `0.1`): it rewrites them, rewrites `implemented` and `released` to `approved` with `delivery: built` (ADR 0023), moves the review extension to `review` (ADR 0025) and re-pins every review pin that matched before the move; it re-pins no run record, so every subject-bound pass is stale until the suite runs again. A reader rejects a record at `0.2` (CORE001) and a 0.6 export (`unsupported-contract`). The breaking changes are ADRs 0023 to 0029, each in a bullet below: the export 0.7 gains `review` on every artifact, `slice.surfaces` and `reports.knowledge[].self`; `help.json` is `intentset/help/0.3`, closed, with `surfaces`, `withheldForReview` and list-valued `audience`, `role` and `flags`, and a 0.18 `readHelp` refuses a 0.2 file; the index is `intentset/publication-index/0.3`, with `keptUnderReview`; CORE010 to CORE013 are new; `evidence.resources` and `evidence.dependencies` are CFG001. The suite and the export moved with them. The help and publisher changes (#145, #146) are a behavior change in `bindTips`'s default render, one new function in `@intentset/help`, a widened option and an optional field in `@intentset/publisher`, and a value for the CLI's `--html`; the publication profile adds the fragment as a MAY and requires a page to drop raw source HTML and link and image URLs with an unsafe scheme (§2), with one new publication case and no existing case changed. docs/consumers.md has the upgrade guide.

- **The versions move.** Core, VSA and the reference profile are renamed `core-0.3.md`, `vsa-0.3.md` and `profile-typescript-amplify-gen2-0.3.md`; every specification that names a version says `0.3`, and the export contract says 0.7. Core, VSA, publication and export are at revision 2026-11-26, and list and the reference profile at 2026-11-25. Every record, example and conformance case declares `spec: '0.3'` and `profile: intentset/<type>/0.3`, and the generated profiles are `intentset/atlas/0.3`, `intentset/publication/0.3`, `intentset/help/0.3` and `intentset/snapshot/0.3`. A record at `0.2` or `0.1` is a CORE001 error whose remediation names `intentset migrate --to 0.3`. The consumer fixtures are rebuilt: each names 0.7, each earlier envelope carries the `spec` and profiles its writer wrote, and `unsupported-contract-0.6.json` is new.
- **`intentset migrate --to 0.3` moves a record through one step per version**, `0.1` to `0.2` to `0.3`, each rewriting `spec` and `profile` and then applying that version's own rewrites: the step to `0.3` rewrites the status (ADR 0023) and moves the review extension to `review` (ADR 0025), each in a bullet below, and the run then re-pins every review pin that matched before the move (the re-pin bullet below). `--to 0.3` is the only target. Migrate rewrites records only, so `.intentset/agents.md`, which still shows `0.2` templates and the old Never rules after the move, is refreshed by deleting it and running `intentset init --agents` (`init` never overwrites), or compared with what `intentset guide` prints; commit it with the migration, or an agent copying its templates writes `0.2` records (CORE001).
- **`intentset review` reads a base copy at an earlier version as migrated, so a migration's pull request lists no approval it did not make.** Reading the base's records with the 0.3 reader rejected every one, so "Approvals and status changes" listed each record of a repository that moved as new and approved. A base copy that declares `0.2` or `0.1` now goes through the same steps as `intentset migrate`, in memory and writing nothing, before its status and approval are compared; a status or approval changed in the same commit as the move still shows. Core §10 says so (a clarification: no case changed). BEH-REVIEW-APPROVALS (revision 2) and TEST-REVIEW-APPROVALS say so too.
- **A subject is computed one way: `evidence.resources` and `evidence.dependencies` are removed** (Core §8 and §11, ADR 0026, #127). Breaking for a repository that sets either key: its configuration stops with CFG001, as for any unknown key, at every value the key took, `exercised` and `files` included; remove the key. A resource's files are in a subject where a verification exercises the resource or an implementing slice owns it, and EVID006 still says what that cannot see; a slice reached only through `dependsOn` contributes every file it claims. `used` and `entrypoint` are gone, and with `entrypoint` the `contract` and `decision` subject parts and EVID007, which is no longer defined. The subject rule under the defaults did not change: the pinned hashes in the unit tests and the evidence cases are the ones they were. That does not carry a pass across the upgrade: a subject hashes its verification record and every record it verifies as whole files, and `intentset migrate --to 0.3` rewrites `spec` and `profile` in each, so every subject-bound run record is stale after the move; run the suite (or `intentset evidence stale --format <runner>`) and import the results in the migration's pull request before an L3 or L4 gate passes. In the suite, the cases of `used` and `entrypoint` are removed, or are now CFG001 cases (three in `core`, one per key and a boundary for `dependencies: files`, and one per key in `evidence`); the `files` cases keep their hashes without the key. `Config.evidence` is `{ binding, globalInputs }`, `subjectSource` no longer takes `resources` or `dependencies` or returns `resourceMode` or `dependencyMode`, and `computeSubject` no longer takes `resourceMode` or `dependencyMode` or returns `dependencyInternals`. `EVIDENCE_RESOURCES`, `EVIDENCE_DEPENDENCIES`, `DEFAULT_EVIDENCE_DEPENDENCIES` and their types (core), and `contractsOf`, `DependencyInternals`, `DEPENDENCY_INTERNALS_LIMIT` and the `contract` and `decision` members of `SUBJECT_PART_KINDS` (verification) are removed; `scripts/subject-backtest.ts` computes the two removed rules itself, so the measurements in ADR 0013 can be made again. BEH-EVIDENCE-CURRENT and TEST-EVIDENCE-CURRENT (revision 4) say so.
- **`status` is the review lifecycle, and `delivery` says what exists: `implemented` and `released` are no longer statuses** (Core §1, §5 and §7, VSA §2, publication §1, list §1 and export §2, ADR 0023, #126). Breaking: a record that declares either is CORE001, as any value outside `draft`, `approved`, `deprecated` and `retired` is, and the frontmatter and export schemas' status enums lose both. `intentset migrate --to 0.3` rewrites each to `approved`, and on a capability, behavior, rule, scenario, slice or contract that states no `delivery` writes `delivery: built` on the next line, which is what the status claimed (a `delivery` holding `null`, `~` or nothing states none, so that line becomes `delivery: built`); a record that states `delivery` keeps it, a type that never carries one gets `approved` and nothing more, and a deprecated record is left as it is. The effective delivery is the field, else `built` for `deprecated`, else not stated (`BUILT_STATUSES` is `["deprecated"]`), so CORE005 keeps two conditions: `delivery: planned` on a deprecated record, and a built behavior implemented by a planned slice. Ownership (CORE006, VSA001) and publication read `approved` and `deprecated` as past draft; `list --status` rejects the two values, as `statuses` in `--where` does, and `--count-by status` has four groups: a gate that selected `--status implemented,released` selects `--status approved --delivery built` (`deliveries` in `--where`), and a script that marked records implemented writes `delivery: built` and leaves `status` alone. The agent guide's "Never" list says an agent sets no status past `draft`, and that `delivery` is the fact it may write. In the suite, the ten cases that used either status keep testing what they tested with `approved` or `deprecated` (five in `core`, one in `export`, four in `list`); `core` gains a CORE001 case for each value, a boundary for a deprecated record without delivery and one for an approved behavior without delivery beside a planned slice (232 cases to 236), and `list` one for the two values in `statuses` (50 to 51). No record under `examples/` or `product/model/` used either. BEH-DELIVERY and TEST-DELIVERY (revision 2), BEH-MIGRATE (revision 3), TEST-MIGRATE and RULE-NEVER-REWRITE (revision 2) say so.
- **`intentset migrate` reads past a comment line inside the `intentset:` mapping, and names a record whose status it could not rewrite.** A comment at column 0 between two keys, which YAML allows, ended the mapping for the rest of the scan, so a status after it stayed `implemented` or `released` and the record was counted as moved while 0.3 rejected it (CORE001); before `type`, it left `delivery: built` out. A blank or comment-only line now belongs to no key, in the rewrite of `spec` and `profile` and in the status rewrite, and so in the base copies `intentset review` migrates. A record that still declares either status after the move, in a form the rewrite cannot read, is named on stderr with what to change and not counted as moved, and the command exits 1. The reference profile's §5 example no longer tells a reader to mark its behavior `released` (text only). BEH-MIGRATE and TEST-MIGRATE say so.
- **`intentset migrate` reads a quoted or spaced key as YAML does, and checks each rewrite as YAML.** `"delivery": planned` or `delivery : planned` beside an `implemented` status was not seen, so `delivery: built` was written as a second key, which validation rejects (CORE001) and which contradicted the stated value; a quoted `type` was not seen either, so a released behavior became `approved` with no delivery, changing what it said exists, and the command exited 0 both times. The status, type and delivery keys are now read bare, single- or double-quoted, with optional spaces before the colon. After the move each record is read as YAML and compared with the original: one that no longer reads, still declares a removed status, or was `implemented` or `released` on a type that carries delivery and is left without one is named on stderr with which of these it is, not counted as moved, and the command exits 1. BEH-MIGRATE and TEST-MIGRATE say so.
- **The Atlas says a derived delivery is `built` because the record is deprecated**, the one status that still implies it (Core §7 at `0.3`), on a record's page and in the product page's count of built behaviors, where it said the status claimed an implementation.
- **A knowledge review is the core field `review`, pins content hashes unless it says `file-v1`, and is withheld from an export with its source** (Core §1, §4 and §9, publication §3 and §5, export §2, §3 and §7, ADR 0025, #130, #49). Breaking: `extensions.intentset.org/review` is CORE001 on any record, since left alone it would read as no review, and `review` is `sources` (source ID to hash), with optional `hash` and `snapshot`, on knowledge only; any other type, an unknown key, a pin key that is not an ID, or a pin, `hash` or `snapshot` that is not a non-empty string is CORE001, and drops the whole review; a null `hash` or `snapshot` is absent. A review with no `hash` now pins `content-v1`; the whole-file kind is named `file-v1`, and any other value still matches nothing. `intentset migrate --to 0.3` moves the extension's block to `review`, one level up and otherwise byte for byte, writing `hash: file-v1` first where it named no hash, and removes `extensions` when nothing else is left in it; a record it could not move, whose review would change kind, or whose review 0.3 would reject (a record that is not knowledge, which keeps the extension, or an extension holding a key other than `self` or `gates`, a pin key or a value its 0.2 reader ignored) is named and exits 1, while a `self` or `gates`, whatever it holds, is left out of `review` and named without failing (ADR 0027). The content hash leaves out `review` as it left out the extension, so moving the extension to `review` changes no content hash; the example's pins were re-pinned for the move to `0.3`, as the re-pin bullet below describes, and a test holds them. `intentset approve` writes `review` with no `hash` and replaces a review left under the extension. The export carries `review` on every artifact, null except on reviewed knowledge, with `hash` and `snapshot` null where absent, and leaves out a pin, and a `tips` entry, keyed by a withheld artifact's ID, counting each in `withheldLinks`, so a restricted rule's ID no longer reaches a customer-visible knowledge record's export; `help.json` is unchanged and keys its tips by explained ID, as publication §5 now says beside the export's rule. The frontmatter and export schemas, `readExport` and the `ReviewMeta` and `ExportReview` types follow, `RETIRED_REVIEW_EXTENSION` is exported from core and `DEFAULT_PIN_KIND` from the publisher, and the publisher's `REVIEW_EXTENSION` is removed. In the suite, the 52 publication cases that wrote the extension write `review`, with `hash: file-v1` where their literal pins are whole-file hashes, and gain two cases of the default and a boundary in which whole-file pins with no `hash` need review (55 to 58); `core` gains six accepted shapes and thirteen CORE001 cases (236 to 255); `export` gains the field, a withheld pin and tip with their count, a boundary of a pin withheld alone, and a bad pin and tip keyed by a withheld artifact (20 to 24); the example's knowledge and its graph hash and the consumer fixtures are rebuilt. Two tests that allowed a restricted ID in the review pins now hold it nowhere in the envelope. BEH-REVIEW-PINS (revision 3), BEH-MIGRATE and BEH-EXPORT (revision 4), BEH-APPROVE and TEST-REVIEW-PINS, TEST-EXPORT and TEST-APPROVE (revision 2) and TEST-MIGRATE (revision 3) say so. The move to `0.3` rewrites `spec` and `profile`, which both kinds cover, and re-pins each pin that matched before it (the bullet below), so a review current before the move is current after it with nothing to do by hand. An export no longer names a withheld artifact in a diagnostic's `field` either: a bad pin or tip keyed by one is reported with the pointer's token replaced by "a withheld artifact", as its text is (export §3).
- **A diagnostic code names one kind of thing to fix: CORE010, CORE011 and CORE012 are new** (Core §11, ADR 0024, #129). Breaking: an existing case's diagnostics change. A carrier that cannot be read, a document with no frontmatter, frontmatter the strict subset rejects (a duplicate key included) or a file over the size limit, is CORE010, where it was CORE001; a missing level-one heading equal to the title, or a missing level-two section the type requires, is CORE011, where it was CORE001; a record past draft that lacks a relationship it must have, the error form of the CORE009 warning (an outcome no measure judges, a rule nothing governs, a scenario that illustrates nothing, a verification that verifies nothing, knowledge that explains nothing, a product slice that implements nothing), is CORE012, where it was CORE003. Everything else stays: CORE001 is a field's shape, the `markset` key and the `intentset` block included, and the status, review-extension and `delivery` errors added on the way to `0.3` among them; CORE003 is a link that does not resolve, names the wrong type, the record itself or the same ID twice, and a `tips` key outside `links.explains` stays CORE003. No code is renumbered or reused, and the diagnostic's shape, the export and the schemas, which hold a code's form and not a list, are unchanged. **An adopter's gate that names CORE001 or CORE003 to mean "any of these" must name the new codes too.** In the suite, 28 cases change code: in `core`, 15 to CORE010 (the 13 rejections of C06 and the two without frontmatter), 6 to CORE011 and 6 to CORE012, and in `export` the unreadable record's case, in its diagnostics and its export; the cases named by code are renamed with it, and `core` gains a boundary in which an approved contract nothing exposes is not CORE012 (255 cases to 256). `intentset approve` refuses an outcome nothing measures with CORE012. A unit test holds one code to each kind. BEH-VALIDATE-REPORTS and TEST-VALIDATE-REPORTS (revision 2), TEST-APPROVE (revision 3) and TEST-MIGRATE (revision 4) say so.
- **`intentset migrate` re-pins every review pin that matched before the move, and `intentset approve --renew-review` renews a review without returning the knowledge to draft** (Core §1, §7, §9 and §10, publication §3, ADR 0025 and ADR 0022 amended, maintainer's decision of 2026-11-25). A move rewrites `spec` and `profile`, which both pin kinds cover, so every review pinned against the records at `0.2` went stale by migrating, and the upgrade guide told adopters to copy hashes into the pins by hand. Now `migrate --to 0.3` reads the whole tree before writing: a `content-v1` or `file-v1` pin equal to its source's hash as the source was written, at the version it declared, becomes the same kind of hash of the source as moved, in a knowledge record the run moves or one already at `0.3` (one at a version migrate does not read is left byte for byte), keeping the pin's quoting; a pin matches only as its record's own version read it, so a `0.2` review that named `hash: file-v1`, a kind `0.2` did not know, stays stale; a pin that did not match is left as written, so a stale review stays stale, and no pin is written that was not there. It says how many pins it re-pinned and how many it left, and names a matched pin it could not reach (a key written as an escape) and exits 1; when the knowledge, or a source it pins, does not read as YAML at `0.3` (a `__proto__` key a `0.2` reader dropped), it names each pin it could not compare, leaves it as written, exits 1 and says to discard the run, remove the key and migrate again. docs/consumers.md now says not to re-pin by hand. `intentset approve <KB-…> --renew-review --by <name>` writes only `reviewedBy`, `reviewedAt`, content-v1 pins of each source, and `self` and `gates` (ADR 0027, below) into the approved or deprecated knowledge it is given, leaving `status` and `approval` as they are, skips every other record and names it, requires `--by`, refuses a dirty tree unless `--allow-dirty`, and validates with the change applied as `approve` does; `--json` lists `renewed` in place of `approved`. CLAUDE.md's design invariant 1 says both, in the maintainer's words, and the agent guide says an agent runs `--renew-review` only when the person reviewing says so in so many words, as for `approve`. No case changed for these two (the re-pin and the renewal are the CLI's, which the suite does not exercise). BEH-MIGRATE and TEST-MIGRATE (revision 5), BEH-APPROVE (revision 3), TEST-APPROVE (revision 4) and RULE-NEVER-REWRITE (revision 3) say so.
- **A publication request may name every audience and role its reader holds, and every file of the publication names that whole entitlement** (publication §1, §2, §4 and §5, Core §9, ADR 0029, #144). `audience` and `role` take a non-empty list as well as one value, read as a set: order and repeats change nothing, and `"teacher"` is the request `["teacher"]`. Knowledge that lists any of them is published in one run, so a document may link one that only another of the reader's roles admits, and a tip still goes to the lower knowledge ID whichever role admitted it. The document block, `help.json` and the index always write `audience`, `role` and `flags` as sorted lists of the request's values, even for one value, held all-of: a product serves a file only to a reader who holds every value it names, and `@intentset/help`'s new `servedTo(file, reader)` checks that, the reader's visibility clearance included. Breaking for readers of `help.json`, of the document block and of the index: strings become lists, and a block's `flags` is now the request's, not only those its knowledge requires. An empty list, a member that is not a name, one unknown member, and a list in `product`, `release` or `edition` each refuse the whole request (PUB001), and a CORE008 for an audience or role names only the request's values. A title in a body is allowed only by a document still published in the run, so a candidate refused later, for a link or for its Markset, no longer lends its title (PUB002); the title and reference checks repeat until a round refuses nothing. `help.json` is closed: a reader refuses a file missing a member of the table or holding one the table does not give, in any object, and its members are written in the table's order, which §5 now says in place of "keys sorted"; the paragraph on files carrying a `snapshot` is gone, and `Help.snapshot` with it. The index names its profile first, `intentset/publication-index/0.3`, and its request, with authorization added back, publishes the same bytes, so a cache keys on it; docs/consumers.md says so. **A repeated `--role` or `--audience` on `intentset publish` or `intentset mcp --mode customer` used to keep the last value and now publishes for the set**, so a wrapper that passes a default and then an override gets both; a value is never split on commas, and a refused one holding a comma gets a hint to repeat the option. The summary lines of `publish` and `mcp` are unchanged for one value and name `roles [administrator, teacher]` for two. The publisher exports `CheckedRequest`, `LIST_DIMENSIONS`, `SINGLE_DIMENSIONS`, `requestList`, `audienceReason`, `availabilityReason` and `PUBLICATION_INDEX_PROFILE`, and `REQUEST_DIMENSIONS` is removed; `project()`'s `Projection.request` is the `CheckedRequest` that `checkRequest` returns, so its `audience` and `role` are always sorted lists, where they were the request as given; `exclusionReason`, `audienceReason`, `availabilityReason`, `indexedRequest`, `publicationMeta`, `keptPublicationMeta`, `generateDocument` and `helpFile` take either form and read one `audience` or `role` as a list of one, never as its characters, but check nothing else, so a caller with a request from outside passes it through `checkRequest` first; `@intentset/mcp`'s customer tools name `audience`, `availability.role` and `availability.flags` in every result's header as sorted lists, so a client that read `audience` or `role` there as a string breaks too; it refuses an index of another profile or with a member the spec does not give, and a document whose block names another entitlement than its index. In the suite, the publication section gains twenty-one cases (59 to 79; the case on the HTML's URL schemes moves from 59 to 80) and the snapshot case's expected output changes to the list form; the conformance schema accepts a list in each of the five dimensions so a case can pin its refusal. The export did not move. BEH-PUBLISH-READER and BEH-HELP-READER, with TEST-PUBLISH-READER and TEST-HELP-READER, are drafts in Intentset's own model.
- **Knowledge whose sources changed what they promise can be published, marked under review, from the text its review covered, when a request sets `keepUnderReview`** (Core §1, §9, §10 and §11, publication §1 to §5, export §2, §4.2 and §5, ADR 0027, #142). A review now pins the knowledge's own text (`review.self`, its content hash without `ending`) and its sources' audiences, visibility and availability (`review.gates`), and `intentset approve` and `approve --renew-review` write both. The move to `0.3` writes neither, so a migrated review stays current but cannot be kept under review until its reviewer runs `intentset approve <KB-…> --renew-review --by <name>`. Knowledge edited after such a review is no longer published as current and is CORE008 at L4, at `/intentset/review/self`. A source whose audiences, visibility or availability changed is never kept. Kept documents are written under `under-review/`, carry a visible note after their title, a `noindex` page, a fragment wrapped in `data-intentset-under-review`, and `underReview: true` and `changedSinceReview` in their block and `underReview: true` in `help.json`; they are listed in the index's `keptUnderReview` and returned in `PublishResult.keptUnderReview`, apart from `documents` and `index.published`, so `@intentset/mcp` never serves one. They are never chunked, current documents never depend on them, and their rule tips are held back in `withheldForReview`. `keptUnderReview` and `withheldForReview` are always written, `[]` when empty. `intentset publish --keep-under-review` sets the field; the site, the chat's corpus and `intentset mcp` never do. `@intentset/help` leaves under-review help out unless a product passes `underReviewHelp: "include"`, reports it in `pendingReview`, never in `missing`, marks a rendered tip with `data-help-under-review`, and adds `reviewStateFor` and `articles`. `intentset review` lists knowledge whose review changed beside approvals, under "Approvals, reviews and status changes", and leaves out exactly the re-pins a migration writes; `intentset migrate` leaves a `0.2` review extension's `self` and `gates`, which `0.2` never read, out of `review` and names each record it left them out of, so they never become pins and a review current before the move is current after it; the agent guide forbids an agent from writing a review. Specs: Core, publication and export move with `0.3` (revision 2026-11-26). Suite: thirty-two publication cases (P04, P01, PUB001, PUB002, CORE008 and an audience case) and four core cases (C01, and CORE001 for a `self` or `gates` that is not a string, a null `self` among them: only a null `hash` or `snapshot` reads as absent) added, none changed. Export: `0.7` gains `reports.knowledge[].self`, and one consumer fixture, `knowledge-own-text-changed.json`.
- **A slice can say which knowledge leads each surface of a product, and the help file maps each surface to the articles published for its reader** (Core §3, §8, §9 and §11, VSA §3, publication §5, export §1, §2, §3, §5 and §7, ADR 0028, #143). This adds `slice.surfaces` (VSA §3), a map from a surface ID the product chooses, such as a route or an exposed module and its internal route, to the knowledge that leads it in order; the export's `slice.surfaces` (0.7), always present, `{}` when none, less withheld knowledge; and `surfaces` in `help.json` (`intentset/help/0.3`), written only from approved or deprecated slices that are built, available to the request and not restricted unless authorized, only for a key that names nothing the reader may not see, and only when one of its leads was published in the run. CORE013 is new, for a surface declared by two slices that are not retired; a surface without `availability`, or with a key, entry or list that breaks VSA §3's rules, is CORE001; retired knowledge leading a surface is CORE005. The YAML reader refuses a `__proto__` key in any mapping (CORE010), which it used to drop silently. `@intentset/help` adds `leadFor`, `surfaceHelp` and the `surface` option of `helpForPage`, which leave a lead under review out by default through `underReviewHelp`, and `readHelp` requires `surfaces`; `@intentset/publisher` adds `helpSurfaces` and `PublishResult.omittedSurfaces`; `intentset publish` names the slices the projection admits whose surfaces it left out; the engineering MCP server's `intentset_lookup` withholds and counts a restricted lead in a slice's surfaces, as the export does; and `intentset review` gains a "Surfaces changed" section and `surfaceChanges`. Architecture messages say "public contract surface", as VSA now does everywhere it means an entrypoint. The suite gains 31 core, 3 export and 25 publication cases and invalidates none; the consumer fixtures are rebuilt, their slice declaring one surface.
- **The engineering MCP server's `intentset_lookup` withholds a restricted ID in a knowledge record's `tips` and a verification's `exercises`**, as it withholds a link and a slice's surface lead: a server started without restricted data returned a customer article's tip keyed by a restricted rule, with its text, and a verification's `exercises` naming a restricted slice, while the same ID looked up read as unknown. Each is left out and counted in `withheld`, as the export withholds a tip (ADR 0025). No case, export or published file changed.
- **`intentset init --example` writes the shop**, the invented online shop intentset.org tells, under `product/shop/`: its accounts, from why they are changing to the help customers read, in 17 records, with `markset: true`. It wrote Lantern's scheduling example until now. Lantern stays in `examples/scheduling/` as the conformance suite's baseline, and `@intentset/conformance-suite` now ships both examples, which is where the CLI reads the shop from outside a checkout. No case changed.
- **`bindTips`'s default render no longer sets `title`** (#145). It sets `data-help-tip` to the tip's text beside `data-help-knowledge`, and nothing a browser displays: a `title` shows only on mouse hover, never to keyboard or touch users, and screen readers announce it inconsistently. A product that relied on the default `title` now shows nothing until it passes a `render` that puts the tip in a visible tooltip and an accessible description. An authored `title` was kept before and is still left alone.
- **`watchTips(root, help, { render, unrender, attribute })`** binds once, binds again on DOM changes under `root`, batched to one pass per animation frame, and returns `coverage()` and `dispose()`. `dispose` stops observing and calls `unrender` on every element it bound; with the default render and no `unrender` it puts `data-help-tip` and `data-help-knowledge` back as they were, so help mounted into another application's page leaves it as it found it, and with a product's own `render` and no `unrender` it undoes nothing. The observer and the frame scheduler can be passed in, typed so the browser's own and `setTimeout`/`clearTimeout` are accepted, which is how it is tested without a DOM; `cancelAnimationFrame` is the default only when `requestAnimationFrame` is. BEH-HELP-WATCH and TEST-HELP-WATCH are drafts in Intentset's own model.
- **`renderHtml: "page" | "fragment"`, with `true` meaning `"page"` byte for byte (#146).** A fragment, `PublishedDocument.htmlFragment`, is what the page holds inside `<main>`, rendered by the same `@markset-lang/render-html` call and so sanitized the same way, without the title heading and with no stylesheet, `<html>`, `<head>`, `<body>` or provenance, which is on `publication`. `intentset publish --html=fragment` writes `<ID>.fragment.html`; `--html` and `--html=page` write pages as before. `renderFragment(markset)` is exported. The conformance driver now offers each case's fragments to its `mustNotContain` as well as its pages. BEH-PUBLISH-FRAGMENT and TEST-PUBLISH-FRAGMENT, drafts, on the publisher slice.
- **A page and a fragment carry only `http`, `https`, `mailto` and scheme-less link and image URLs** (publication §2). `@markset-lang/render-html` drops raw HTML but checks no URL scheme, so `[x](javascript:…)` in a knowledge body reached the page as a live link. The publisher now removes, before rendering, every link, image and definition whose URL has another scheme, read case-insensitively and with tabs, line breaks and leading control characters ignored as a browser ignores them, and keeps the link's text or the image's alt text. The rule is for URLs taken from the source: a diagram the renderer draws from a captioned figure stays a `data:image/svg+xml` image it builds, with the source's text escaped, so a product whose Content Security Policy restricts `img-src` allows `data:` to show one. The Markset document is unchanged. §2 now also requires a page to drop raw source HTML, which the reference publisher already did. The new case is "the HTML carries no link or image URL whose scheme is not http, https or mailto, and keeps their text"; no existing case changes.
- **`@intentset/core`'s README no longer names the wrong reader of the export.** Its example now reads "as a tool that reads the export does": one adopter reads a repository's records and run records, and another reads the export (intentset.org's new page, What reads an Intentset model). README text only.

**The Atlas opens on the product as a tree and says what each page is for, traces each behavior on its page, lists what needs a person, and lays its map out in layers (#159).** Minor: two new pages, a section and one page removed in `@intentset/atlas`, the navigation's order, and a layered map; no specification, case or export changed.

- **`intentset init --example` writes the shop's code and tests under `src/` as well as its records**, so the checks above L1 and the example's own tests run in the directory it writes. The shop gained them (`examples/shop/src/`): the reset link's policy and the sign-in lockout, each with a node:test file its verification names. Most of the shop's records are now approved; the sign-in behavior stays a draft, and the rule that a reset link works once still has no test. `@intentset/conformance-suite` ships the code with the records. Both of the shop's slices declare `surfaces` and the `availability` a surface requires (ADR 0028): `/account/reset-password` and `/sign-in` are each led by KB-RESET-PASSWORD, so the help file published for the shop's customers maps both routes to that article. Its review also pins the article's own text in `self` and its sources' gates in `gates` (ADR 0027), written by `intentset approve KB-RESET-PASSWORD --renew-review`, so the article can be kept under review when a source changes.
- **`@intentset/cli` exports `atlasOf(session, options)` and `openSession`**, so a caller can build the Atlas `intentset serve` shows with the Atlas's options; intentset.org uses it to publish the shop's Atlas with the `example` notice.
- **The product page, "Your product, as a tree", is the landing page, `index.html`.** It says in two lines what the Atlas is and names each other page with the question it answers, then gives the totals the overview gave. Each product, its intents and its outcomes (with each outcome's measures) are headings; each capability is a fold that starts closed, its title saying how many behaviors it holds; beneath each behavior are its rules, scenarios, owning slice, verifications and knowledge, linked, each with its state: verified, failing, stale, missing a run, not linked, or not assessed without run evidence, and knowledge current or held for review. Every level says its counts and what each counts. **The overview page is gone** (Gary, 2026-11-26): its totals are on the product page, and its chart of behaviors by capability went with it. BEH-ATLAS-OUTLINE and TEST-ATLAS-OUTLINE, drafts.
- **Every page opens with one sentence saying what it is for, and the notice is one line**: internal and not for publication, or, for an invented example, that it is invented. The navigation is Product, Needs attention, Map, Records, Ownership, Verification, Publication, Diagnostics.
- **A behavior's page opens what it derives with a trace**: why (intents, outcomes, measures), the behavior, its rules and scenarios, its owning slice and the decisions behind it, its verifications and their evidence, and what people are told, as six steps, each record linked and an empty step said, not hidden. BEH-ATLAS-TRACE and TEST-ATLAS-TRACE, drafts.
- **Needs attention, `attention.html`, second in the navigation**: drafts by type, claims with no current pass split into failing, stale, missing a run and named by no verification, files no slice claims (VSA009, AMP004, when an architecture check was supplied, and said not checked otherwise), and knowledge held for review with why. Each group names its count and scope; a group of more than ten folds closed. BEH-ATLAS-ATTENTION and TEST-ATLAS-ATTENTION, drafts.

- **The map is layered, and each record's page draws its neighborhood (ADR 0015 amended).** Products, intents and outcomes are rows on top, each outcome's measures beside it; every capability is one node with a count of the records it holds; its behaviors, rules, scenarios, checks, knowledge and the code that delivers them are laid out in columns beneath and hidden until a reader opens the capability, one at a time, which also fits the view to it and dims nothing inside it; All capabilities folds it again. Without the script the capabilities show folded. The layout is positional, so it is deterministic and takes milliseconds. The force layout now draws a record's neighborhood at the end of its page: the record, the records one link away and, under 24 in all, two links away, with no controls and no script. BEH-ATLAS-MAP is revised; BEH-ATLAS-NEIGHBORHOOD and TEST-ATLAS-NEIGHBORHOOD are drafts. `placeHtml` and `AtlasPage.html` take a list, filling a page's slots in order.

**A record declares Markset with `markset: true`, and the original `markset: 0` stays valid and means the same (Gary, 2026-11-26), with Markset pinned at 0.6.0.** Minor: a widened check in `@intentset/core`, new output from the publisher, the Atlas and the agent guide, and the Markset pin. Core and the publication profile revised 2026-11-26, without moving `intentset.spec`: no existing conformance case changed its verdict.

- **Core accepts `markset: true` (Core §3).** CORE001 now refuses only a missing `markset` or a value other than the YAML boolean `true` or the number `0`: `false`, another number and a quoted `"true"` or `"0"`. Its remediation recommends `markset: true`. `spec/frontmatter.schema.json` says the same (`enum: [true, 0]`). Three conformance cases are new in `tests/core.json` (`true` valid, `false` and a quoted `"true"` refused) and two are renamed, since `markset` is no longer a version.
- **A `content-v1` pin hashes `markset: true` as `markset: 0`** (publication §3), so moving a source from one form to the other keeps every review on it current. Pins taken before are unchanged. A whole-file pin still moves with any byte of its source.
- **Everything Intentset writes declares `markset: true`**: published documents (publication §2; PUB003 now reads "not valid Markset, or does not declare it"), the Atlas's pages, and the agent guide's text and examples. The publisher and the Atlas check that what they wrote declares Markset, as Markset 0.6.0's parser reports both forms as `true`.
- **`@markset-lang/*` is pinned at exactly 0.6.0**, from 0.4.1. 0.4.2 and 0.5.0 changed nothing the adapter, the publisher or the Atlas read: no diagnostic, node shape or parse result moved, and `serializeDocument` writes the same bytes. 0.6.0 normalises `frontmatter.markset` to `true | null`, which the publisher and the Atlas now check.
- **Intentset's own model declares `markset: true`.** `examples/scheduling/` keeps `markset: 0`: it is the conformance suite's baseline, and the suite pins hashes of its bytes (graph hashes, evidence subjects, whole-file review pins), so it stays as published. `intentset init --example` therefore writes records with the original form, which stays valid.

## 0.17.1 — 2026-11-25

**The specifications say what the rule is and leave its history to this file and the ADRs.** Text only (Core, VSA and the reference profile, revision 2026-11-24): no check and no case changed, so `intentset.spec` stays `0.2`, and the suite and the export contract did not move.

- **Core §1's table of revisions names each change and no longer retells it.** Each row keeps its date, its sentence, its sections and its ADR; what the revision replaced and what a repository does about it is in this file under that date, where it already was.
- **The specifications no longer name an adopter or quote its measurements** (Core §1 and §8, VSA §3 and §9, profile §9). The two VSA rules keep their reason as a sentence of their own. The example product is Lantern, and the adoption log is where a real product is named.
- **AMP013 says what it requires of the modes a merge forces onto a Merged API** (profile §9, #19). One authorizer decides every request a person makes; a further mode, such as the `AWS_IAM` that Amplify Gen 2 adds to every source, must be one no person can present, with each field behind it still checking access. It is a review assertion and no case names it, and a Merged API that met the old sentence meets this one, so nothing that conformed stops conforming.
- **The agent guide states when an agent may run `intentset approve` as a rule of its own.** 0.17.0 put the command in the same "Never" bullet as setting a status, then gave the exception, which read as a contradiction. It is now its own bullet: never run it unless the person approving says so in so many words, and `--by` is their name. Guide text only.

## 0.17.0 — 2026-11-24

**`intentset approve` writes a person's approval into the drafts they name, and `intentset review` lists every record whose status or approval changed since the base, so an approval is made with one command and read by the pull request's reviewer like any other change.** Minor: one new command, one new section in `review`'s text and `statusChanges` in its JSON. The specifications changed text only (Core §1, §7 and §10, revision 2026-11-24): no check was added and no case changed, so `intentset.spec` stays `0.2`. The suite and the export contract did not move.

**Why (ADR 0022).** 0.16.0 gave a record a place to say who approved it and checked that block's shape, and left writing it to an editor or a script: find the drafts, change `status`, write `approval`, and for knowledge compute each source's content hash and pin it. An approval is a reviewed change to a record, and nothing holds one outside the files, so the tooling is a command that makes that change correctly and a review that shows it.

**`intentset approve <ID>... --by <person>`.** It takes IDs or the selector options of `intentset list`, and changes only drafts; a matched record with another status is listed as skipped. Each draft gets `status: approved` and an `approval` with basis `direct`, `by` as given and `at` as given or today, in place of any earlier `approval`; a knowledge record also gets the review publication requires, `reviewedBy`, `reviewedAt` and `content-v1` pins of its sources. Those lines change and no other byte does. It validates the tree with the approvals applied, at L1 or the `--level` given, and writes nothing and exits 1 when that adds an error, naming each. `--dry-run` shows what it would write; a tree with uncommitted changes to tracked files is refused unless `--allow-dirty`, as `migrate` refuses one. `--by` is required and never guessed.

**What it does not do.** It never commits or pushes, and it cannot know who runs it: the approval is a diff, and the repository's own review is what accepts it. It writes no `derived` or `attested` approval, which record an approval made somewhere it cannot see, and it does not review again a knowledge record that is already approved.

**`intentset review`.** A new section, "Approvals and status changes", and `statusChanges` in `--json`, list each record whose `status` or `approval` differs from the base, with the approval it now states or "no approval stated". A status moved by hand shows there as an approval written by `approve` does, which is what lets a reviewer see an approval nobody was entitled to make.

**The second rewrite.** Tools never rewrite records, with two exceptions now, each only when asked: `migrate` and `approve`. The agent guide tells an agent never to run `approve` on its own account, only when the approving person says so, with the name they give.

## 0.16.0 — 2026-11-15

**A record can say who approved it, when and on what basis, and a behavior, rule or scenario can name the outside requirement it formalizes: two optional fields, `approval` and `formalizes`, shape-checked by `validate`, left out of the content hash, and carried by the export, `intentset context`, the MCP server and the Atlas.** Minor: two new optional fields, new API in `@intentset/core` (`APPROVAL_BASES`, `FORMALIZES_TYPES`, `exportApproval`, `exportFormalizes`, `approvalSummary`, `formalizedSummary`, and the types `Approval`, `ApprovalSource`, `Formalized`, `ExportApproval`, `ExportFormalized`), and **the export moves to `intentset/export/0.6`**, so every reader of an export upgrades. The specifications changed (Core §1, §4, §5, §7 and §8, publication §3, list §2 and export, revision 2026-11-14) without invalidating any case's `valid` or `diagnostics`, so `intentset.spec` stays `0.2` and the list result stays `intentset/list/0.1`. The suite gained 40 cases and the consumer fixture `unsupported-contract-0.5.json`.

**Why (ADR 0020).** `status: approved` read the same whether a person read the record or it was derived from something a person approved. A tool that approves a work item's intent once, and the records derived from it on that basis, left a reader of the model unable to tell which was which. Intentset holds no workflow policy and still does not: it never says who may approve or when a person is required.

**`approval` (Core §7).** On a record of any type: `at`, when; `basis`, `direct` (a person read this record), `derived` (a named source that a person approved covers it) or `attested` (an agent attested it, and no person approved it or a source); `by`, the person, required for direct and derived and not written for attested; `source`, required for derived and not written otherwise, with `ref` (a URL or a tool's item key) and at least one of `revision` and `digest`; `attestedBy`, the agent, required for attested, optional for derived and not written for direct. A malformed block is CORE001 with a pointer to the member. It is not required on an approved record, it is not compared with `status`, and `ref` is never resolved. It sits beside `reviewedBy`, `reviewedAt` and the `intentset.org/review` extension and means something else: those are a knowledge review against pinned sources.

**`formalizes` (Core §5).** On a behavior, rule or scenario: a list of at least one entry, each a `source` (a URL or a tool's item key) and an optional `anchor` for the part that is meant. On another type, or malformed, or with an entry repeated, it is CORE001. It is not a relationship: no edge, no inverse, and it is never resolved.

**The content hash leaves both out (publication §3).** Writing or changing `approval`, and naming or renumbering what a record formalizes, leaves a `content-v1` review current. `sourceHash` is the whole file as before, so the graph hash moves, a whole-file pin needs review, and a subject-bound run record of a verification of the record reads stale until it runs again, as when a status changes. No record could carry either field before, so no existing content hash moved.

**A verification's standing (Core §8).** Nothing in the specifications reads an approval from a verification's status: its runs count whatever its status short of retired, and whether evidence is required follows the claim. Core §8 now says so, and that a tool may treat a verification's standing as that of the claims it verifies. No check, option or derived field was added.

**Everywhere else.** The export carries `approval`, the block with null where the basis carries no member, or null, and `formalizes`, sorted by source and anchor, or an empty list; `readExport` accepts 0.6 only. `intentset context` shows both, as a line each and in `--json`, and the MCP server's `intentset_lookup` and `intentset_context` carry them. The Atlas shows both on a record's page. The agent guide tells an agent to name what a record formalizes and never to write `approval` on its own account.

**An earlier release rejects both fields** as unknown keys under `intentset`, so a repository moves its tools before it writes either.

## 0.15.0 — 2026-11-15

**A publication names its snapshot in a file of its own, `snapshot.json`, and nowhere else, so publishing the same knowledge at two commits writes the same bytes in every other file, and published output can be committed without each commit rewriting it.** Minor: `help.json` and `index.json` lose `snapshot`, so `HelpFile`, `HelpOptions` and `PublicationIndex` in `@intentset/publisher` lose it, `PublishResult` gains `snapshot` (a `SnapshotFile`), `CustomerPublication` in `@intentset/mcp` requires `snapshot`, and `intentset publish` gains `--no-snapshot`. The specifications move no version: publication §2 and §5 change text and §6 is new, Core §1 and §9 change text, one publication case's `published` expectation moved and none changed its `valid` or `diagnostics`, so `intentset.spec` stays `0.2` and the profiles `intentset/publication/0.2` and `intentset/help/0.2` stay. The export contract did not move.

**Why (ADR 0021, amending ADR 0019).** 0.14.0 took the snapshot out of the documents and left it in `help.json` and the index. The commit and the graph hash move with every commit that changes a record, so a repository that commits its published output still had both files of every projection rewritten by each publication, ten files for an adopter with five projections, and two branches that each published conflicted on all of them. The `commit` written was also the one checked out when the command ran, which can never be the commit that contains the output.

**The snapshot file (publication §6).** `snapshot.json` holds `profile` (`intentset/snapshot/0.2`), `derived`, `commit` (null when unavailable) and `graphHash`, and nothing of the request, so every projection published from one snapshot writes the same bytes. No other file of a publication carries the commit or the graph hash. A request whose snapshot's graph hash is not the graph's is still PUB001.

**When the output is committed.** Publish with `--no-snapshot`, or ignore `snapshot.json` in version control; do not commit it. Output that is deployed or handed to another system keeps it: it is the only record of which state of the model the documents were made from.

**Readers.** A reader that took the snapshot from `help.json` or `index.json` reads it from `snapshot.json`. `readHelp` in `@intentset/help` accepts a help file with or without `snapshot`, so 0.15.0 reads what 0.14.0 wrote; **`@intentset/help` 0.14.0 and earlier refuse a help file written by 0.15.0**, so a product updates `@intentset/help` before, or with, the publisher. The MCP server's customer mode cites the snapshot it is handed with the publication, and its results keep their shape.

**Conformance.** The publication case that asserted `help.json` names the snapshot now asserts that the snapshot file does, and that no document, index or help file carries one.

## 0.14.0 — 2026-11-14

**A published document no longer carries the snapshot it was published from, so a change to one record no longer changes every published file: the publication names its snapshot once, in `help.json` and the index.** Minor: `PublicationMeta` in `@intentset/publisher` loses `snapshot`, and generated documents, their HTML and their chunks lose it with it. The specifications move no version: publication §2 and §5 and Core §1 and §9 change text, no existing conformance case changed its `valid` or `diagnostics`, so `intentset.spec` stays `0.2`, the publication profile stays `intentset/publication/0.2`, the help file `intentset/help/0.2`, the export `0.5` and the list result `intentset/list/0.1`. The suite gains 1 case.

**Why (ADR 0019).** Every document's `intentset-publication` block carried `snapshot`, the commit and graph hash it was published from. The graph hash moves with any record in the model, so every published file changed whenever any record did. An adopter that commits its published help, about 850 files, saw two pull requests that each changed a record conflict on all of them, and resolved it by publishing again, three times on one pull request in one day.

**What a document carries (publication §2).** The block keeps `source` with the knowledge's `sourceHash`, `sources` with each admitted source's `id`, `revision` and `sourceHash`, `withheldSources`, `audience`, `availability`, `reviewer`, `reviewedAt` and `publishedAt`, in that order, and MUST NOT carry the snapshot. The HTML `<meta name="intentset-publication">` and each retrieval chunk carry the block unchanged, so they drop it too. A document's bytes now change only when its knowledge, a source it names, the request or `publishedAt` does.

**Where the snapshot is (publication §5).** `help.json` names it, `commit` (null when unavailable) and `graphHash`, as it already did, and the index keeps it. A reader that took the snapshot from a document reads it from either. A request whose snapshot's graph hash is not the graph's is still PUB001.

**The MCP server.** Customer mode cites the index's snapshot for every passage and document, so its results keep the same shape. It no longer checks each document's snapshot against the index, because documents have none.

**Conformance.** A publication case asserts that the document, its HTML and its chunks carry no snapshot and that `help.json` names it.

## 0.13.0 — 2026-11-12

**A knowledge review can pin what a record promises instead of its whole file, so approving, implementing or marking delivery on a source no longer sends every guide that explains it back to review; and `intentset list --count-by delivery`.** Minor: a new pin kind in publication §3, new API in `@intentset/core` (`contentHashOf`, `Artifact.contentHash`, `CONTENT_HASH_OMITS`, `ENDING_STATUSES`) and `@intentset/publisher` (`pinHash`, `PIN_KINDS`, `ReviewStatus.unknownHash`), `contentHash` in `intentset context --json` and the MCP server's context tools, and one removal (below). The specifications move no version: publication §3, Core §9 and list §4 gain text, no existing conformance case changed its `valid` or `diagnostics`, so `intentset.spec` stays `0.2`, the export stays `0.5` and the list result `intentset/list/0.1`. The suite gains 12 cases.

**Why (ADR 0018).** Each review pin was the SHA-256 of the whole source file, so a status change, a `delivery` (0.12.0) or a source's own review fields made every guide explaining it read `needs-review` although nothing it explains changed. An adopter that moves records through the lifecycle in bulk sent every reviewed guide back to review each time, and re-signing out of habit empties the signal.

**Two pin kinds (publication §3).** A review record with `hash: content-v1` pins each source's content hash: SHA-256 over the canonical JSON of its parsed frontmatter without `status`, `delivery`, `reviewedBy`, `reviewedAt` and the `intentset.org/review` extension, its body, and `ending` when its status is `deprecated` or `retired`. Key order, quoting and indentation do not count; the title, body, links, availability and every other field do, and so does a source going away. A review record without `hash` pins whole files and is read exactly as before, so no existing review needs re-signing: it moves to `content-v1` the next time someone signs it off. Any other `hash` matches nothing, so the knowledge needs review. Publication, `validate`, the export's knowledge report and the Atlas all judge by the record's kind. `sourceHash`, the graph hash, evidence subjects and drift review are unchanged.

**Writing pins.** Every record carries `contentHash` beside `sourceHash`: in `@intentset/core`, in `intentset context --json` and in the MCP server's context tools. The example's knowledge record now pins `content-v1`, so its bytes, the export case's graph hash and the consumer fixtures moved.

**`--count-by delivery` (list §4).** Groups the matched records by their effective delivery, `built`, `planned` or `unstated` by name, never null, so each group's count is what `--delivery` with that value lists. A row still carries no delivery.

**Removed.** The CLI's re-exports of `describingRecords`, `claimingSlices`, `activeSlices` and `isSliceCode`, deprecated in 0.11.0 and kept through 0.12.0. Import them from `@intentset/core`. `matchGlob` and `matchAny` stay on the CLI's surface.

**Conformance.** Nine P04 cases in `tests/publication.json` pin literal content hashes of the example's sources and then approve, mark built, review, edit the body, a link, availability or a rule's title, deprecate, or name an unknown kind; two more read whole-file pins. An L11 case counts by delivery. The case schema's `countBy` takes `delivery`.

## 0.12.0 — 2026-11-12

**A record says whether its work is built, apart from whether it is approved: an optional `delivery: planned | built`, read by `validate`, `list`, the export, the Atlas and publication.** Minor: a new optional field, new API in `@intentset/core` (`deliveryOf`, `DELIVERIES`, `DELIVERY_TYPES`, `BUILT_STATUSES`) and `@intentset/publisher` (`plannedSources`), and **the export moves to `intentset/export/0.5`**, so every reader of an export upgrades. The specifications changed (Core, VSA, publication, list and export, revision 2026-11-12) without invalidating any case's `valid` or `diagnostics`, so `intentset.spec` stays `0.2` and the list result stays `intentset/list/0.1`. The suite gained 21 cases, one catalog ID (L12) and the consumer fixture `unsupported-contract-0.4.json`.

**Why (ADR 0017).** Status is one ordered axis, so a draft could not say "this describes code that exists, and nobody has approved it yet". An adoption writes hundreds of such drafts from existing code, and each looked exactly like a proposal. `implemented` before `approved`, a `proposed` status and a provenance field were weighed and rejected; the ADR says why.

**The field (Core §7).** `delivery` is `planned` (the work does not exist yet) or `built` (the code it describes exists), on a capability, behavior, rule, scenario, slice or contract; on any other type, or with another value, it is CORE001. A record's effective delivery is the field, else `built` when its status is `implemented`, `released` or `deprecated`, else not stated: `approved` is never read as built. It states a fact about the code, so whoever writes the record sets it, an agent included, and it approves nothing.

**What validate reports.** CORE005, an error, for `delivery: planned` on an implemented, released or deprecated record, and for a built behavior whose implementing slice says planned. At L2, CORE006 and VSA001 warn about a draft behavior that says built and that no product slice implements. A draft slice that says built, or implements a behavior that does, has no planned paths: its missing claim (VSA009) or entrypoint (VSA002) is an error, not the draft's warning. Release labels are opaque, so a planned record naming a shipped release is not judged.

**Everywhere else.** `intentset list --delivery planned|built|unstated` (the selector field `deliveries`) matches the effective delivery, from the tree or an export. The export carries each artifact's `delivery` as written, or null; `readExport` accepts 0.5 only. The Atlas shows delivery beside the status on the overview, its behavior tables and every record's card, and counts the behaviors whose work is built and planned. Publication excludes knowledge that explains a record whose `delivery` is `planned`, with the new reason `planned`. The agent guide that `init` writes tells an agent to write `built` on a record written from existing code and `planned` on a proposal, and the adoption guide says the same.

**Kept one more release.** The CLI's re-exports of `describingRecords`, `claimingSlices`, `activeSlices` and `isSliceCode`, deprecated in 0.11.0 and due to go in 0.12, stay until 0.13, so a consumer that moves its pin for the export's 0.5 does not have to change its imports in the same step.

## 0.11.0 — 2026-11-11

**`intentset list` answers which records match a selector, from the repository or from an export, with `select` in `@intentset/core` underneath it.** Minor: a new command, new API in `@intentset/core`, and the slice helpers moved from the CLI to core. A new specification, the list contract (`spec/list.md`, `intentset/list/0.1`), and a clarification of Core §1 that names it; no existing conformance case changed, so `intentset.spec` stays `0.2`. The suite gained a sixth section, `list`, with 43 cases and three optional case fields (`selector`, `countBy`, `list`); the export did not move.

**A closed selector, as data (ADR 0016, spec/list.md §1).** Fields combine with AND and the values within one field with OR: `ids` (a trailing `*` is a prefix), `types`, `statuses`, `owners`, `audiences`, `visibilities`, `under` (an ancestor on the navigation chain), `availability` (`products`, `releases`, `roles`, `editions`, `flags`, and `notReleases`, all matched exactly), `hasExtension`, `links` (a direction, a kind, `some`, `none` or `all`, and a `match` on the far end, one hop), `describing` (Core §10's records that describe a slice) and `claims` (the slices claiming a path). An unknown key, an empty list or a value outside a closed set is rejected, with a JSON pointer per problem. There is no query language, regex, comparison operator, sort order or percentage, and no dependency.

**The command.** `intentset list` takes a flag per field, repeatable or comma-separated, `--has [some:|none:|all:]<out|in>:<kind>[=<status>,...]` for a link, or `--where <file.json>` for the whole selector; `--from <export.json>` reads an export through `readExport` with no repository I/O; `--count-by <field>` counts the matches; `--format table|json|ids`. It never writes. It exits 0 whenever it answered, a failed validation included (the result says so), 1 with `--check` when a record matched or is undetermined, and 2 for an invocation error. `list` joins design invariant 7 and RULE-READ-ONLY-CHECKS, which now also names `evidence stale`.

**The tree and its export give one answer.** A graph is read through the export's projection, so restricted records are withheld unless `--include-restricted`, exactly as `graph` withholds them. Where the answer for a record depends on a link to a withheld record, the record is undetermined: counted and listed apart, never a match or a miss. Every list names its snapshot, the validation's status and totals, the normalized selector, and the counts considered, withheld, matched and undetermined; a field the source lacks, such as `reviewedBy` from an export, is `not-supplied`.

**Moved to core.** `describingRecords`, `claimingSlices`, `activeSlices`, `isSliceCode`, `matchGlob` and `matchAny` are exported by `@intentset/core`. The CLI still exports `matchGlob` and `matchAny`, and re-exports the four slice helpers until 0.12, so a consumer that copied `describingRecords` can call Intentset's instead.

## 0.10.0 — 2026-11-03

**Every record in the Atlas has a page that opens with what the record says, and the Atlas stays readable on a model of thousands of records.** Minor: new pages and a new `source` option in `@intentset/atlas`, and one moved address in `intentset serve`'s output (below). No specification version, conformance case, export version or `intentset.spec` moved.

**Every record has a page (#108, #109).** `intentset serve` writes `records/<ID>.html` for every record, not only behaviors, and a Records page lists them all by type. A page opens with `Records › <type> › <ID>` and the record's chain of parents, then the record in one card: its file's path, every frontmatter field as a row, and its text rendered from the record's own parse (text that does not parse as Markset is shown as written, and the page says so). What the Atlas derives follows the card: links other records write to it, and what its type adds. Every record ID on the overview, ownership, verification and publication pages, and every node on the map, links to its page. The `source` option names where the files live, so the card links each one; without it, nothing is linked.

**Moved address.** `behaviors/<ID>.html` is now `records/<ID>.html`. A link into an Atlas built by 0.9.0 or earlier that names a behavior's page must change.

**The overview's chart and the map stay readable on thousands of records (#110).** `index.html`, `verification.html` (chart SVG), `map.html`'s styles and `atlas-map.js` change; no existing caller's call does.

**The chart's rows no longer squeeze.** Markset's built-in bar chart draws a fixed 340-unit figure, so with 45 capabilities each row was about 5 units: labels overlapped, were cut to 17 characters (several became the same) and the bars were hairlines. The Atlas now hands render-html its own bar engine through the `charts` option (every other chart type stays Markset's): same classes and tokens, a row of at least 26 units per category, the category axis as wide as the longest label, a repeated value axis and ruled rows once there are more than 12 categories, and the same 340-unit figure as before for a few. A capability's label is its ID without CAP-, whole up to 40 characters and cut in the middle past that, so two IDs that start alike still differ. The table under the chart is unchanged. Markset's own engine could take the same rule; that is Markset's to decide.

**The map's labels no longer balloon.** The ID and circle sizes were in SVG user units, so zooming into a large map scaled them with it. On every view change `atlas-map.js` now sets each circle's radius and each shown ID's size from the zoom: type about 12 pixels, a circle at most 1.5 times its size at the fit and never under 2.5 pixels, with the outlines at a fixed pixel width. A small model (120 records or fewer) still shows every ID. A larger one shows an ID only where its box overlaps no other shown ID and no circle of a record ranked before it, in a fixed priority: the selected record, the focused one and the selected record's links, then products, intents and outcomes, capabilities and slices, behaviors, rules and checks, the most linked first. Zooming in shows more of them, and none is ever larger. A wheel step costs about 5 ms on 3,800 records and 5,900 links, viewBox change included.

## 0.9.0 — 2026-10-21

**The architecture check judges what an import takes rather than the file it names, keeps UI frameworks and JSX out of policies, models and the client seam, and holds a migration baseline to "may shrink, may not grow", one imported name at a time.** Minor: new rules, a new configuration key, a new case field and new API in `@intentset/architecture` and `@intentset/cli`, and stricter results that a repository may see as new errors (below). The specifications changed (VSA, the reference profile and Core, revision 2026-10-21) without invalidating any case, so `intentset.spec` stays `0.2`; the conformance suite gained 12 cases and an optional `architecture` case field; the export did not move.

**VSA006 judges a name by the layer of the file that defines it (#86, VSA §5, profile §3).** An entrypoint is in no layer, so a hook that took a client function through its slice's entrypoint, a barrel in a layer it may import, or another slice's entrypoint passed. The extractor now records the names each import takes and what each file exports; `NameIndex` follows a name through `export … from`, exported import bindings and `export *` to the file that declares it, and the layer matrix is applied there, across a contract too. A name it cannot follow is listed as not checked.

**Policies, models and the client seam do not import UI frameworks or render JSX (#87, profile §3).** `forbiddenPackages` in `.intentset/architecture.yaml` maps a layer to package patterns, matched on the specifier as written; the default names the UI frameworks for `policy`, `model` and `external`, and a mapping a repository gives replaces it. TS007 reports a forbidden package, TS008 JSX outside presentation.

**A migration baseline may shrink and may not grow (#88, VSA §9).** In migration mode an entry that matches nothing is VSA014, an error until the baseline is written again. `intentset review --baseline <file>` lists the entries the base's copy did not hold and those it retired, reading a renamed file's entry as moved and a smaller cycle as a shrink, and `--fail-on-baseline-growth` exits 1 on growth. `--write-baseline` says what it added and retired.

**A baseline entry holds what a finding is about, one imported name at a time (#20, #88).** An entry's fingerprint no longer hashes the message, so a reworded message, such as AMP007's list of declared areas, keeps its entry; a finding about an import has one entry per name, so taking another name from a baselined import is an error naming it, and dropping one retires its entry. Entries carry the name and the message. A baseline written by 0.8 still matches as it is; written again, it takes the new form, which review calls a rewrite, not growth.

**What an upgrade may show.** VSA006 for UI that takes client code through an entrypoint or barrel; TS007 for a UI framework in a policy, model or client file; TS008 for JSX outside presentation; VSA014 for each baseline entry whose violation is gone. A baseline absorbs none of the first three, since they are new findings. Set `forbiddenPackages` to change TS007's default.

## 0.8.1 — 2026-10-20

**The Atlas's map comes first on its page, no ID on it overlaps another record, and the picture fills its frame.** A patch to `@intentset/atlas`: `intentset serve`'s `map.html` changes, and no existing caller's call does. No specification version, conformance case, export version or `intentset.spec` moved.

**The map comes first.** `map.html` opens, after its notice and snapshot line, on one sentence saying what the map
holds, then the map and its controls; how to read it (the legend) and how to use it follow below the picture, under
headings of their own. The page's Markset source marks where the map stands with a classed thematic break
(`{.am-slot}` then `***`), so the source alone still reads in order; `placeHtml` and `MAP_SLOT` let a caller that renders
the source in a shell of its own put the map there, as intentset.org does. A page with no slot gets its HTML after the
rendered source, as before.

**No ID overlaps another record, and the frame fits the drawing.** After the force layout, where the IDs show (up to
120 records), a fixed number of passes push apart any two records whose circle and ID overlap, along the axis where
they overlap least, in ID order and with arithmetic only, so the same graph still gives the same bytes. Because IDs
are wide and short, separating them alone stacks a crowded map into a tall column, so the forces' picture is first
widened by each of six fixed factors and the one whose drawing comes closest to 1.4:1 is kept (on this repository's
own 96 records, a 1025 by 698 drawing rather than 597 by 883). The SVG's
view box is fitted to what is drawn, IDs included, with a 16-unit margin rather than 40, and the map's height follows
the drawing's proportions (up to 75% of the screen) instead of a fixed height, so the picture fills its frame rather
than sitting in the middle of it. Full screen is unchanged. No dependency was added.

## 0.8.0 — 2026-10-15

**The Atlas gains a map of every record and link, explorable and able to fill the screen, review pages laid out with more of Markset, and a notice for an invented example's Atlas.** Minor, because each adds to `@intentset/atlas`'s API and `intentset serve`'s output without changing what an existing caller gets. No specification version, conformance case outcome, export version or `intentset.spec` moved.

**`@intentset/atlas` can draw an invented example's Atlas.** `buildAtlas` and `buildAtlasSources` take `notice:
"example"`, which opens every page with a note that the product is invented and that a team's own Atlas stays
internal, in place of the internal banner. The default is unchanged. No specification version, conformance case,
export version or `intentset.spec` moved. intentset.org uses it to publish the worked example's Atlas.

**The Atlas is laid out with more of Markset.** A behavior's context bundle is a grid of cards, one per role, which a
narrow screen reduces to one column; its record text is folded, so the page ends on the checks rather than the source.
The overview opens its capabilities as cards and, from three capabilities, draws behaviors and coverage per capability
as a bar chart. The verification page draws its evidence statuses as one when run evidence is supplied. Each chart is
render-html's built-in engine, drawn in front of the table it is drawn from, which stays on the page; still no script.
`atlas.css` is Markset's stylesheet with three rules added. No specification version, conformance case, export
version or `intentset.spec` moved.

**The Atlas has a map (ADR 0015).** `map.html` draws every record as a node and every authored link as an edge, laid
out when the Atlas is built with a seeded force layout, so the same graph gives the same bytes. Without script it is a
picture whose records link to their pages; `atlas-map.js`, the one script the Atlas carries and only the map loads,
adds finding by ID, showing or hiding each family, panning, zooming, and selecting a record to see only its links.
`intentset serve` serves `.js` and adds `script-src 'self'` to its policy. `atlasMapLayout`, `mapHtml`, `MAP_SCRIPT`
and `MAP_STYLES` let a caller place the map in a shell of its own. No dependency was added, and no specification
version, conformance case, export version or `intentset.spec` moved. The map has a Full screen button: the browser's
own full screen where there is one, and a fixed overlay where there is not (an iPhone).

## 0.7.1 — 2026-10-15

**A resource's files now count in a subject where a verification exercises them, a dependency can count through its contract as an opt-in, and a selector shared by several verifications gives each a record.** Records made under 0.7.0 read stale until imported again, or until `evidence.resources: used` is set. No specification version, conformance case outcome, export version or `intentset.spec` moved: Core §8 and §11 describe the new subject rule, and the conformance suite gained cases for it without changing an existing one.

**A dependency slice can count through its contract, as an opt-in, and a selector two verifications share gives each a record (ADR 0013, amended 2026-10-15, second).**
Under 0.7.0 a slice reached only through `dependsOn` puts every file its claims resolve to in a subject, so a change to a central slice moves nearly every
subject: `SLICE-PLATFORM-ORGANIZATION` moved 227 of the 237 browser records of an adopter's store. `evidence.dependencies: entrypoint | files` in
`.intentset/config.yaml` (an unknown value is CFG001) chooses what such a dependency contributes: `entrypoint` its binding fields, the files its
`entrypoints` name and the records of the contracts it exposes or consumes and the decisions they name (new `contract` and `decision` parts of the subject),
`files` every claimed file, as before. A slice that implements a verified behavior or that `exercises` names still contributes every file. The rule was
measured before it was shipped (`docs/adoption/subject-binding-backtest.md`, "Amendment 2026-10-15 (second)"): it keeps a median 98.0% of verifications
current per commit against 97.2% and cuts the files a verification hashes from a median 87 to 17, with 0 false greens among the 27 replayed fix pairs, but on
the adopter's 237 records it keeps 5 current at the later commit, as `files` does, because the central slices' entrypoints and records really changed. The
bar for a new default was 60%, so **the default stays `files`** and `entrypoint` is an opt-in. A new warning, EVID007, says how many verifications are
current though a file of a slice they depend on changed outside its entrypoints and contracts since their record, naming the slice, its changed files (the
first five) and the verifications (the first twenty); it needs the git history EVID005 and EVID006 ask for. Core §8 and §11 and the change table moved, with the D
cases of `tests/evidence.json` and two CFG001 cases in `tests/core.json`; no existing case changed its `valid` or `diagnostics`, so `intentset.spec` did not move,
and the export did not change.

**`evidence import` gives every verification that names a selector its own record.** A selector two verifications share (one test verifying two behaviors)
mapped to the first verification only, so the rest were silently missing: the 237 records of the adopter's browser store came from an import with this bug.
`toRunRecords` now takes a selector's verification or list of verifications and writes a record for each from the same tests (each rationale names the matched tests
as before), a selector no test matched is listed once, and the output stays deterministic; the CLI's note lists the shared selectors and says each gets a record.
Re-import where verifications share a selector to give the missing ones a record.

**A resource's files count in a subject only where a verification exercises it (ADR 0013, amended 2026-10-15).** Release 0.7.0 hashed
the files of every resource an included slice lists in `usesResources`, so one backend change made stale every verification of every web slice that
talks to that backend: an adopter's first browser run, judged at a later commit, read current for 5 of 274 verifications, 133 of the stale ones
because five `amplify-docs` files changed. A resource's files are now in a subject where `verification.exercises` names the resource, or where a slice
that implements a verified behavior lists it and also claims a file its path matches (its own resource); the slice record's binding fields,
`usesResources` among them, still count. `evidence.resources: exercised | used` in `.intentset/config.yaml` chooses (default `exercised`; `used` is
0.7.0's rule and reproduces its hashes exactly; an unknown value is CFG001), and a new warning, EVID006, says how many verifications are current though
a resource their slices list and they do not exercise changed since their record, naming the resource, its changed files and the verifications (EVID005 no
longer lists those files). A subject-bound record made under the 0.7.0 rule carries a hash the default does not compute for a verification whose slices
list resources, so it reads stale until imported again, or until a repository sets `evidence.resources: used`. Core §8 and §11 and the specification's
`revision` moved, with the S cases of `tests/evidence.json` (new cases for an unexercised, an exercised, an owned and a `used` resource and for EVID006;
the two cases that tested the 0.7.0 rule say `resources: used` in their configuration, so no existing case changed its `valid` or `diagnostics`), and
`intentset.spec` did not move. The export did not change: EVID006 travels as a diagnostic, and the `binding` and `note` fields carry nothing new. The
back-test of `docs/adoption/subject-binding-backtest.md` has a dated section comparing the two rules.

## 0.7.0 — 2026-10-14

**Export 0.4 and specifications 0.2 are breaking for a consumer that pins export 0.3 or `intentset.spec` `0.1`.** Export 0.4 carries the evidence binding, and the
specifications and `intentset.spec` move from `0.1` to `0.2` (ADR 0014), and the conformance suite's cases move with them (new export and consumer cases, `0.2` in every fixture). The worked example's knowledge is also
approved, reviewed and carries two tips, the walkthrough shows what publication writes for it, the example says
"student assessment", and intentset.org gained a Copy button.

- **`intentset evidence stale`** (ADR 0013, "Slow suites") lists the automated verifications whose evidence at the
  snapshot is not a current pass, each with its selector, locator and status (stale, missing, error, skip,
  current-fail or unresolved) and, for a stale subject record, the note that names the part that moved. The default
  is a table grouped by locator file with counts; `--format json` is a stable, sorted object (`snapshot`, `binding`,
  `needRun`, `manual`, `counts`); `--format playwright|vitest|node-test` prints the arguments that make that runner
  run just those tests, escaped for its regular expression and quoted for a POSIX shell (paste them, or pass them through `eval`), and an empty line when nothing needs
  a run. `--check` exits 1 when anything does; otherwise the command exits 0 and never writes. A person's manual
  review is listed apart. `--release <product>:<label>`, `--evidence` and `--binding` are read as `graph` reads them;
  the level is L3 or above. The selection and the runner formats are exported from `@intentset/verification`
  (`staleReport`, `runnerArguments`). No specification, export or conformance change.
- **Export 0.4 carries the evidence binding** (ADR 0014, stage 2b of ADR 0013). The evidence report says which binding
  the repository judged by (`binding`: `subject` or `commit`) and why (`bindingReason`: `configured`, `default`, or
  `no-slices`, the EVID004 fallback); each verification carries the `binding` that judged it and its `subject`, the
  SHA-256 of its subject at the snapshot, which a reader compares with a record's `subjectHash` instead of recomputing
  it; `latest` is the whole run record, `binding` and `subjectHash` included; and a stale subject record's `note` names
  the part that moved. A verification artifact carries `exercises` (a list, empty when it declares none, less withheld
  IDs). `graph` no longer classifies by commit where the repository judges by subject: the export states the
  repository's own verdict, so a record made at an older commit reads `current-pass` while its subject is unchanged,
  where 0.3 showed `stale`. The reader's rule for a current status is per binding (export §4.1, §5): commit binding as
  before, subject binding needs `binding: subject` and a `subjectHash` equal to the verification's `subject`. A note
  can name a withheld artifact's ID or path, so the export redacts them in notes as it does in diagnostics. A 0.4
  reader rejects a 0.3 envelope as `unsupported-contract`, with the version it supports in the message.
- **The specifications move to `0.2`**, as Core §1 describes (ADR 0014): Core, VSA, the reference profile, the
  publication profile and the export contract now say 0.2 (their `id`, title and revision; the files are
  `spec/core-0.2.md`, `spec/vsa-0.2.md` and `spec/profile-typescript-amplify-gen2-0.2.md`), a record declares
  `spec: '0.2'` and `profile: intentset/<type>/0.2`, and a reader of `0.2` rejects a record that declares `0.1` as CORE001,
  saying how to move it. Core §1 states no migration, so none is invented: the reader stays strict and the move is one
  command. **`intentset migrate --to 0.2`** rewrites `intentset.spec` and `intentset.profile` in the frontmatter of
  each record the model reads (the files the scope matches), keeps every other byte, prints how many it moved, leaves a
  record at another version alone, and refuses a tree with uncommitted changes to tracked files (or no git work tree)
  unless `--allow-dirty` is given, so the rewrite is a diff of its own. It is the one command that rewrites records, and
  RULE-NEVER-REWRITE and design invariant 1 name it as the exception. It does not touch `.intentset/agents.md`, which
  carries an example record: write the guide again with `intentset guide > .intentset/agents.md`, or edit its
  `spec` and `profile` lines.
- **What each consumer must do.** Both pins move to 0.7.0 together, and neither reads a 0.3 export or a `0.1` record
  again.
  - **A repository that writes the export**: `model:export` and every script that pins `@intentset/cli@0.6.1` move to
    `@intentset/cli@0.7.0`, and the repository runs `intentset migrate --to 0.2` once, in the same pull request. Any
    reader of `.intentset/export.json` accepts `intentset/export/0.4`, uses export §4.1's rule for a current status, and
    shows the binding beside a status.
  - **A tool that reads the export**: `@intentset/core` moves to 0.7.0, which rejects `0.1` records, so `intentset
    migrate --to 0.2` runs in the same change on any records it holds; its reader accepts `intentset/export/0.4` and
    reads the new members (`binding`, `bindingReason`, `subject`, `exercises`, a record's `binding` and `subjectHash`),
    and any export fixture it keeps is replaced by a 0.4 one.
  - **Markset** has no model (`product/` holds no records), so it migrates nothing. **Intentset** migrated its own 90
    records (and the 15 of the worked example, which `init --example` copies) in this change.
  - `docs/consumers.md`'s requirement tables name the same members; its one new section says what to change.
- **Conformance.** `tests/export.json` gains four cases (a subject-bound report that reads current at an older commit, a
  stale one whose note names the moved part, a commit-binding report as 0.3 judged, and the no-slices fallback), run by
  the harness's export driver, which now makes the evidence report for a case that carries run records; `tests/consumer/`
  gains `subject-current.json`, `subject-stale.json`, `commit-fallback.json`, `subject-hash-mismatch.json` (rejected as
  `inconsistent-report`) and `unsupported-contract-0.3.json` (rejected as `unsupported-contract`), and was rebuilt from the
  recipe. `tests/core.json`'s CORE001 case now says a record at `0.1` is rejected. Every record's `spec` and `profile`
  lines changed, so every `sourceHash` and the graph hash moved: the baseline graph hash is
  `6914e830beab0ab9fe5564eb18a9e93bbdadaa242379e9e79275b82aaf795bb5`, and the subject hashes the evidence cases pin, and
  the review pins of the worked example's knowledge, moved with it. A conformance suite version marker of `0.1` is `0.2`.

**Also in this release:** the worked example's knowledge is approved, reviewed and carries two tips, the walkthrough
shows what publication writes for it, the example says "student assessment", and intentset.org gained a Copy button.
Nine conformance cases gained a patch so that each still describes the draft or untipped record it is about now that the
suite's baseline is neither, and nothing that conformed stops conforming.

- **Run evidence is judged by subject binding by default wherever slices claim files, and by commit binding when a repository or a gate asks for it** (ADR 0013, stage 2). Core moved (§8, §11; revision 2026-10-14), and because it changed what an existing
  record means the specifications moved to `0.2` and the export to 0.4 (above). The
  evidence schema gained optional `binding` and `subjectHash`, the frontmatter schema optional `verification.exercises`, and
  `.intentset/config.yaml` an optional `evidence` block (`binding`, `globalInputs`). A repository with slices whose records are bound to a commit,
  as every record written before this revision is, reads stale until its runs are imported again or it sets `evidence.binding: commit`: the 27 evidence
  cases that test the commit rule now say so in their configuration, none changed its `valid` or `diagnostics`, and nothing the suite held stops conforming.

  - **The subject.** A verification's subject is a SHA-256 over its record and what it verifies, the binding fields (never the prose) of the slices
    that implement the behaviors, of their `dependsOn` closure and of those `exercises` names, the content of the files those claims resolve to, the
    registry resources they use and their files, the test file and its local imports, and the global inputs. `computeSubject` is in
    `@intentset/verification`; `subjectSource` in `@intentset/architecture` resolves claims, resources and a test's imports with the resolver the
    import graph uses.
  - **`evidence import`** writes `binding: "subject"` and the hash where subject binding is in force, and today's records otherwise
    (`--binding commit`, `evidence.binding: commit`, or no slice claims); it still refuses an uncommitted tree. `--binding subject|commit` is also
    an option of `validate`, `graph`, `review` and the other level commands.
  - **Reports** say which binding judged each verification (`[subject]` or `[commit]`), and when a subject record is stale which part of the
    subject changed since its commit, named from one `git diff`. A commit record under subject binding, and a subject record under commit binding,
    are stale with a note. Two new warnings: **EVID004**, a repository with no slice claims judged by commit for want of a subject, and
    **EVID005**, the files changed since a current subject record that no slice claims, no used resource names, no global input lists and no
    record or test names, so they cannot make evidence stale (the first twenty, with a count).
  - **`verification.exercises`** (slice or resource IDs, unique, CORE003 when one names neither) is read, validated, hashed and exported (export 0.4).
  - **The export carries the binding from 0.4.** Stage 2 first left the export at 0.3, classifying the evidence report by
    commit and saying so in each `note`, because 0.3's reader and closed schema had no place for the binding; export 0.4
    (above) replaced that with the repository's own verdict.
  - **Conformance.** `tests/evidence.json` has the subject cases (S01 to S05): a record current across an unrelated commit, a prose edit of a slice
    record and an unrelated record edit; stale for a change to a claimed file, a dependency's, the test, a helper it imports, an exercised slice, a used
    resource, a global input, the verified behavior's text and a binding field; the commit-record and subject-record mismatches; the no-slice
    fallback (EVID004) and EVID005. The cases pin the subject hash of their tree. A case may carry `changedSince`, the files git would report
    changed between a record's commit and the snapshot. `tests/core.json` has the `exercises` and `evidence` configuration cases.

- **`intentset evidence import --from playwright`** reads Playwright's JSON reporter, as `--from vitest` reads Vitest's.
  A test is named by its `describe` titles and its own, so a verification's selector matches as it does for the other
  runners; a test that ran in several projects counts as the worst of them; `skipped` (`test.skip`, `test.fixme`) is
  skip, a flaky test that passed on retry is pass, a timeout or an interrupted run is error, and an assertion that did
  not hold is fail. Found by an adopter, whose browser tests verify 247 of its 315 behaviors and which the importer
  could not read before: imported against a real report of eight of its tests, six verifications matched. No
  specification, conformance case or export changed.
- **The example's knowledge is approved** (#48). `KB-ASMT-SCHEDULE` is reviewed by its owner against its three
  sources as they are, with their hashes pinned under `intentset.org/review`, and carries two tips, for the behavior
  and for the release-time rule; the permission rule has none, because a tip is optional. Until now the only tips a
  reader of this repository could find were written into the record by `@intentset/help`'s tests at runtime, and the
  example's publication was an empty index. The walkthrough's last act ends with what `intentset publish` writes
  for a teacher on pilot-1, as written: the document with provenance in place of frontmatter and its three internal
  sources counted rather than named, and `help.json` with the two tips keyed by the IDs a control carries. A record's
  fields on the site now show its review and its tips. The pins are real hashes, so an edit to the behavior or either
  rule puts the knowledge back in review: `test/tooling.test.ts` says which pin moved and how to re-pin, and the site
  build refuses to publish a walkthrough with an empty help file. The baseline graph hash moved to
  `bf153850c0ac1583a7803a1363eea05139772fec1b062637431a6e37abbc275f`, `tests/consumer/` was rebuilt from the recipe,
  and the cases about a draft or an untipped record (the two P01 cases, the empty help file, the P04 pair and three
  CORE003 and CORE009 cases) patch the record so. ADR 0011's "Not in the export" is marked superseded by ADR 0012,
  which moved the export to 0.3 with `tips` on every artifact the same day (#47). Found on the way (#49): a review
  pin, and a tip's key, can carry a withheld artifact's ID into an export, since publication requires the pin and
  export §2 carries extensions as authored; two tests now say so where they used to say the ID appears nowhere.
- **"Schedule an assessment" is "Schedule a student assessment"**, and the capability, slice, knowledge and
  verification records that named an assessment alone now say whose. Standing on its own — in the home page's
  reviewer card, in a title, in a list of records — the bare word read as an assessment of something on the page
  rather than as the example's subject. Record IDs are unchanged, so no URL moved and no ID a consumer holds
  changed. The baseline the suite ships carries the new titles, `tests/consumer/` was rebuilt from the recipe, and
  the export's baseline graph hash moved to
  `ce8f27a986463815fee6c81d9b66efd64cb03193f2fa1b20882f7fa0c435c9a6`: Core's own note says a change to any baseline
  byte changes it. Core §1's illustrative frontmatter carries the new title, which is why Core's revision is
  2026-10-07; the example is informative and no rule moved.
- **The specifications page says what each specification is for.** The cards for Core, Traceable VSA, the reference
  profile and the publication profile listed each document's parts, which told a reader new to Intentset little, and
  the publication profile's read as a release process. Each now says what it covers in plain terms; the export
  contract's already did. The publication profile's opening now says the same: publication turns reviewed knowledge
  into documentation and in-app help for one audience and release, and it is not deployment. A clarification, so
  that profile's revision is 2026-10-13 and no rule moved.
- **The agent guide says where the `Intentset-Unchanged` trailer goes**: in the commit message's last paragraph,
  beside any other trailer. Git reads trailers only from there, so a trailer in a paragraph of its own above
  `Co-Authored-By` was silently not read and the drift gate failed the commit. `intentset init --agents` and
  `intentset guide` write the new sentence.
- **A page for the person running the adoption**, `/adopt/`, in the Start rail between How it works and the agent
  guide. The Start page models one capability; this page is for the rest of a product, run by one person through many
  agents working unattended: the three boundaries ("sandbox" names all of them) that have to be in place before
  automation widens, what to set up, how to split work between sessions in worktrees, workflows, subagents and
  routines, what to settle before a long run so nobody has to stay, what a change proves before it lands, and a
  permissions ladder paid for step by step; and why every decision is written down as a record agents write and
  people read, since a session has no memory of the others. It changes no control a team has: whether a green pull
  request merges on its own or waits, and how main deploys, stay the team's rules. The practices are written for any agent; one dated
  table maps them to Claude Code's pieces, checked against its documentation on 2026-10-09. It ends with the one
  instruction that sets it all up, pointing an agent at the page, and `/llms.txt` lists the page so an agent finds it.
- **The agent guide's closing line links the specifications.** It was a bare address, which the site rendered as
  text.
- **intentset.org has a chat.** Every page carries the panel, and the footer's row links the privacy page.
- **The chat answers with Claude Sonnet 4.6 for now.** Bedrock serves Opus 5.5 to the account once Anthropic approves
  its use case; until then the chat uses Sonnet 4.6, with no refusal fallback, and Sonnet 4.6's prices in its budget.
- **The chat's alarms.** Errors, throttles, the day's estimated spend past 80% of its budget, a refusal for the budget,
  and the firewall blocking a flood each email the family's inbox from the branch.
- **Ready to launch the chat.** The privacy page (approved) is built, and linked from the footer, only with the chat;
  a test holds it to the backend's retention periods. A workflow deploys the chat's backend from main once its
  Amplify app and role are named in the repository's variables. intentset.org is unchanged until `ASK_URL` is set.
- **The chat panel.** `site/chat/` is the panel a visitor asks in: a launcher and a dialog beside the page, the answer
  streamed in with its sources, refusals said in words, the conversation kept for the tab. The site carries it only
  when it is built with the chat's address, which it is not yet, so intentset.org is unchanged.
- **The chat's backend.** `amplify/` holds the function that answers a question from the corpus with Claude Opus 5.5
  on Bedrock, streamed through an API Gateway REST API behind a regional WAF, with a visitor's daily count, a daily
  budget, a switch, reserved concurrency and the scrubbed questions kept 90 days. Tests run the whole flow against a
  stubbed model and synthesize the backend twice. It is not deployed for intentset.org yet, and nothing published
  changed.
- **The chat on intentset.org is modelled before it is built, and its corpus is the site.** Intentset's own model
  gains the chat: an intent, two outcomes, two capabilities, six behaviors, four rules and a draft slice for
  `amplify/` and `site/chat/`. `pnpm run corpus` writes what the chat will answer from, built from the same sources,
  tokens and addresses as the pages (32 documents, about 46k tokens), and a test holds it deterministic and under its
  budget. Nothing published changed.
- **Intentset keeps its own model.** `product/model/` describes the packages with Intentset's own records, all
  drafts: one product, one intent, three outcomes, eight capabilities, seventeen behaviors, five rules for the design
  invariants, and one slice per package. CI checks it with the CLI this checkout builds: `validate` at L2 and
  `review --fail-on-drift` against the base. The first architecture check found 17 imports past the conformance
  harness's one entrypoint, all from tests; they are the baseline, which only shrinks. Nothing published changed: no
  package, specification, conformance case or export.
- **A Copy button on every code block on intentset.org**, made by the shell's script rather than rendered, so it
  exists only where the clipboard does and a reader with scripting off never meets a control that cannot work. The
  built HTML inside `<main>` still holds no script.
- **The home page leads with the adoption log** rather than the first pilot alone: two products, the gate on every
  pull request, and the model read back from what an adopter's backend records at runtime. The Start and Roadmap
  pages name the log the way the bar does.
- **The worked example is worked, not listed.** `/example/` was thirteen headings over fifteen links: it said what
  the records were called and nothing about what they do, and reading one meant leaving the page. It is now five
  steps of the model's own chain — why the product is changing, what it promises, where that is delivered, how it is
  checked, what a customer may be told — each explained, with its records open on the page in Markset's folding
  callout, which is a `<details>` and so needs no script. Every record keeps the page of its own that deep links and
  search results use, and each fold links to it.
- **The ground carries the mark's green.** The light ground was a yellow-green under a teal-green tile, and the
  light scheme walked across the color wheel as it darkened: ground at hue 69, surface 100, border 132, accent 159,
  the mark's tile 168. Ground, surface and border are the tile's hue now, at the lightness they already had, so the
  contrast is unchanged to a hundredth (text on the ground, 11.43 to 11.47). The dark ground was already the mark's
  hue and did not move. markset.org and coralreefventures.com were brought to the same rule the same day.
- **A social card.** intentset.org names an `og:image`, so a link to it previews as a picture rather than as text.
  `site/social-card.ts` draws `site/social-card.png` from the mark, the footer's statement and the site's own dark
  tokens; it is run by hand (`pnpm run social-card`) and committed, so neither CI nor a deploy needs a browser, and a
  test holds the committed file to the size the pages tell a client to expect.
- **A code block runs to the document's width**, as a table does. markset.css stops a document's direct children at
  the reading measure, which is right for prose and wrong for a line that cannot wrap: the same block inside a tabs
  construct was already full width, and the one on the Start page scrolled sideways for want of 100px.
- **A page's h1 does not end in a period.** A title is a label, not a sentence.
- **The line saying where a rendered document comes from sits under the h1**, on the agent guide and on each
  specification, so the first thing on the page is the page's name.
- **`site/test/build.test.ts` reads `packages/` by directory**, so a `.DS_Store` no longer fails the suite on a Mac.

**A changelog, a change policy, and specifications that say what they are.** The specifications changed in wording
and in what they document, not in what any check does: no case changed, `intentset.spec` stays `0.1`, and the export
stays 0.3.

- **This changelog**, backfilled from 0.2.0, and a test that requires an entry for the version in `package.json`.
- **A change policy in Core §1**, with one line in the export contract's §7. The suite decides what kind of change a
  revision is, and the next change that invalidates an existing case, in any section and against any specification,
  moves `intentset.spec` to `0.2`. Core §1 also lists the one breaking revision made inside `0.1` so far, on
  2026-10-04 (see 0.6.0).
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
- **`agentGuide`, `AGENT_GUIDE_PATH` and `AGENT_POINTERS` are exported from `@intentset/cli`**, so intentset.org
  serves the same guide at `/guide.md`, with `/llms.txt` pointing agents at it (#12).
- **A README for every published package**, with keywords, so the npm page says what each package is. Tests require
  a README naming each published package and the root README to name all ten. Every command a README shows names
  `@intentset/cli`, as `npx -p @intentset/cli intentset …` or after installing it, because only the CLI has the
  `intentset` binary and npx asked for `intentset` alone fetches an unrelated unscoped package; a test holds every
  README to that, the MCP client configuration included.

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
  and `//` in JSX text no longer hides an import later on its line. Found as three TS004 warnings in an adopter's repository.
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
