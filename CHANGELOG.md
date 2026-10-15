# Changelog

Every release of the `@intentset/*` packages, newest first. Each entry says whether the specifications, the
conformance suite or the export contract moved, because those are what another tool pins. Core §1 says what kind of
change a revision is; while the specifications are drafts, the next change that invalidates an existing conformance
case, in any section of the suite, moves `intentset.spec` (it moved from `0.1` to `0.2` on 2026-10-14).

## 0.7.1 — 2026-10-15

**A resource's files now count in a subject where a verification exercises them, a dependency can count through its contract as an opt-in, and a selector shared by several verifications gives each a record.** Records made under 0.7.0 read stale until imported again, or until `evidence.resources: used` is set. No specification version, conformance case outcome, export version or `intentset.spec` moved: Core §8 and §11 describe the new subject rule, and the conformance suite gained cases for it without changing an existing one.

**A dependency slice can count through its contract, as an opt-in, and a selector two verifications share gives each a record (ADR 0013, amended 2026-10-15, second).**
Under 0.7.0 a slice reached only through `dependsOn` puts every file its claims resolve to in a subject, so a change to a central slice moves nearly every
subject: `SLICE-PLATFORM-ORGANIZATION` moved 227 of the 237 browser records of Streamlane's store. `evidence.dependencies: entrypoint | files` in
`.intentset/config.yaml` (an unknown value is CFG001) chooses what such a dependency contributes: `entrypoint` its binding fields, the files its
`entrypoints` name and the records of the contracts it exposes or consumes and the decisions they name (new `contract` and `decision` parts of the subject),
`files` every claimed file, as before. A slice that implements a verified behavior or that `exercises` names still contributes every file. The rule was
measured before it was shipped (`docs/adoption/subject-binding-backtest.md`, "Amendment 2026-10-15 (second)"): it keeps a median 98.0% of verifications
current per commit against 97.2% and cuts the files a verification hashes from a median 87 to 17, with 0 false greens among the 27 replayed fix pairs, but on
Streamlane's 237 records it keeps 5 current at the later commit, as `files` does, because the central slices' entrypoints and records really changed. The
bar for a new default was 60%, so **the default stays `files`** and `entrypoint` is an opt-in. A new warning, EVID007, says how many verifications are
current though a file of a slice they depend on changed outside its entrypoints and contracts since their record, naming the slice, its changed files (the
first five) and the verifications (the first twenty); it needs the git history EVID005 and EVID006 ask for. Core §8 and §11 and the change table moved, with the D
cases of `tests/evidence.json` and two CFG001 cases in `tests/core.json`; no existing case changed its `valid` or `diagnostics`, so `intentset.spec` did not move,
and the export did not change.

**`evidence import` gives every verification that names a selector its own record.** A selector two verifications share (one test verifying two behaviors)
mapped to the first verification only, so the rest were silently missing: the 237 records of Streamlane's browser store came from an import with this bug.
`toRunRecords` now takes a selector's verification or list of verifications and writes a record for each from the same tests (each rationale names the matched tests
as before), a selector no test matched is listed once, and the output stays deterministic; the CLI's note lists the shared selectors and says each gets a record.
Re-import where verifications share a selector to give the missing ones a record.

**A resource's files count in a subject only where a verification exercises it (ADR 0013, amended 2026-10-15).** Release 0.7.0 hashed
the files of every resource an included slice lists in `usesResources`, so one backend change made stale every verification of every web slice that
talks to that backend: Streamlane's first browser run, judged at a later commit, read current for 5 of 274 verifications, 133 of the stale ones
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
  - **Streamlane**: `model:export` and every `pnpm dlx @intentset/cli@0.6.1` script move to `@intentset/cli@0.7.0`, and
    the repository runs `intentset migrate --to 0.2` once, in the same pull request (750 records: 747 under
    `product/model` and the three `docs/decisions` files its scope names); the `model.yml` comment and `CLAUDE.md` say
    Export Contract 0.4. Any reader of `.intentset/export.json` accepts `intentset/export/0.4`, uses export §4.1's rule
    for a current status, and shows the binding beside a status.
  - **Driftline**: `@intentset/core` moves to 0.7.0, which rejects `0.1` records, so `intentset migrate --to 0.2` runs in
    the same change (33 records); `modelFromExport` accepts `intentset/export/0.4` and reads the new members it ignores
    (`binding`, `bindingReason`, `subject`, `exercises`, a record's `binding` and `subjectHash`), and its watched export
    fixture (`packages/signals/test/watched-export.json`) is replaced by a 0.4 one.
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
  not hold is fail. Found by Streamlane, whose browser tests verify 247 of its 315 behaviors and which the importer
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
  pull request, and the model read back from what Streamlane's backend records at runtime. The Start and Roadmap
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
