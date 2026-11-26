# ADR 0027: Knowledge whose sources moved can be published, marked under review, from the text its review covered

**Status:** accepted, 2026-11-25 (issue #142). Part of the move to `0.3`, with ADR 0023 to ADR 0026, ADR 0028 and
ADR 0029. Builds on [ADR 0018](0018-a-review-pins-what-a-record-promises.md) and
[ADR 0025](0025-a-review-is-a-core-field.md). It changes the publication request together with
[ADR 0029](0029-a-request-is-for-one-reader.md) (issue #144), so `REQUEST_KEYS`, the index's request and the
conformance schema's request each change once. It adds no diagnostic code: CORE010 to CORE012 are ADR 0024's and
CORE013 is ADR 0028's. Design invariant 1 was amended the same day to let `intentset migrate` re-pin the pins that
matched before a move and `intentset approve --renew-review` write a review, so the migration step and the renewal
mode this ADR first deferred land with it.

## Context

A knowledge record whose pinned sources changed is `needs-review`, and publication §3 says it MUST NOT be published. So
the next publication drops its document and all of its tips (`project.ts`, reason `needs-review`). That protects
readers from stale help. It also means that editing a behavior removes that behavior's help from the product until
someone reviews it again. A missing tip makes the product a little weaker. A missing rule tip is worse, because it is
the reason a product gives when it refuses something.

One adopter works around this with about 300 lines of its own code. The script reads the previous publication from
files committed in its repository and writes a lapsed record's document and tips again, unchanged. That works only for
an adopter that commits its publication. An adopter that serves help from an API and calls `publish()` in memory has
no committed copy to carry forward.

The issue proposes that `publish()` take the previous publication as an input and copy a lapsed record's document out
of it. As stated, that is unsafe for three reasons:

- **Nothing ties the copied bytes to a review.** The publisher would trust whatever files the caller passes. A
  previous directory that was edited by hand, or made for a different request, brings in text no review covered, and
  that text can still pass every §4 check.
- **The old publication block describes an old graph.** Its `sources`, `source.path` and the proposed `changed` were
  computed for an earlier projection. A source that has since become internal or restricted would then be named in a
  customer document (design invariant 4, and the class of leak in issue #49).
- **The output stops being a function of the model.** The same graph, request and `publishedAt` would write different
  bytes depending on what the caller had saved.

There is a fact that makes copying unnecessary. When the only thing wrong with a review is that pinned sources
changed, the knowledge record's own body and tips are the text the review covered, provided the record has not been
edited since. Until now nothing checked that last condition. A review pinned its sources and never the knowledge's own
text, so a knowledge body edited after its review was still published as current. The content hash (`content-v1`)
already leaves out everything a review writes (`status`, `reviewedBy`, `reviewedAt`, `approval`, and from 0.3
`review`), and it keeps the body, the tips, the links and the availability. So a pin of the knowledge's own content is
well defined, does not depend on itself, and proves what the issue needs proved.

That proof is not enough on its own. Publication never checks a source's audiences, visibility or availability against
the knowledge that explains it. The review is the human gate between the two. If a behavior that a customer article
describes is made restricted, is taken out of an edition, or narrows its audiences, its content hash changes and the
article lapses. The person who reviews it again decides whether the prose may stay. A rule that keeps the article
published whenever its own text is unchanged would skip that person. The §4 checks catch bare IDs, links, paths and
titles, but prose that describes a withdrawn behavior passes all of them. Keeping an article under review is therefore
safe only when what changed in its sources is what they promise, not who may see them.

Four more facts, read from the code, shape the decision:

- **A migration moves every pin.** `content-v1` covers `intentset.spec` and `intentset.profile`, and the whole-file
  hash covers every byte. `intentset migrate --to 0.3` re-pins the source pins that matched before the move (ADR 0025,
  amended 2026-11-25). A pin of the knowledge's own text moves the same way, so the move must re-pin it too.
- **`@intentset/mcp` refuses any document that is not in the index.** `customerTools` throws for a document that is
  missing from `index.published`. If `PublishResult.documents` held documents kept under review, every API adopter
  that serves a publication made with this option would hit that error.
- **A reader that globs a publication's directory cannot tell two files apart by their names.** Retrieval indexers and
  static hosts read every `*.md` or `*.html` beside the index. Only a different place keeps a kept document out of
  them.
- **Nothing stopped an agent from writing a review.** The agent guide forbade writing `approval`, and `intentset review`
  listed status and approval changes, but neither covered `reviewedBy`, `reviewedAt` or the pins. An agent that copies
  a hash from a tool's output into `review.self` would make an unreviewed edit look reviewed.

## Decision

**A review also pins the knowledge record's own text (`review.self`) and who could see each of its sources
(`review.gates`). When a request asks for it, knowledge whose only problem is that sources it pins changed what they
promise is published from the repository as it is now. It goes through every existing check, is written apart from
current documents, carries a visible notice, and its document, its help entry and its tips are marked `underReview`.
Nothing is read from a previous publication.**

```yaml
intentset:
  reviewedBy: team-assessment
  reviewedAt: '2026-09-30'
  review:
    sources:
      BEH-ASMT-SCHEDULE: 4fede99f81c7...
      RULE-ASMT-AUTH: d241506c14c5...
      RULE-ASMT-FUTURE: a89cf09ddc01...
    self: 9a41c7...    # this record's own text when it was reviewed
    gates: 51be02...   # the audiences, visibility and availability of every source when it was reviewed
```

### The two new pins

- **`self`** is the knowledge record's *own content hash*: its `content-v1` hash taken without `ending`. It is of that
  kind whatever `hash` says, because a record's whole file contains its own review. `ending` is left out so that
  deprecating reviewed knowledge, a status ADR 0023 keeps publishable, does not count as editing its text. Writing a
  review never changes the hash `self` pins, because everything a review writes is left out of it.
- **`gates`** is the *gate hash* of the review's sources: SHA-256 over the canonical JSON of an object that maps each
  source the review must pin (publication §3: what the knowledge explains, plus the rules governing each explained
  behavior) to `{ "audiences": …, "visibility": …, "availability": … }`, with `audiences` sorted, `availability` as
  parsed or null when it is absent, and the whole entry null when the source is not in the graph. It covers neither
  `spec` nor `profile`, so no migration moves it.
- Each one, when present, is a non-empty string. Any other value is CORE001, at `/intentset/review/self` or
  `/intentset/review/gates`. Like a source pin, a string that is not the current value reads as changed, and no shape
  is checked beyond that. So the fixture placeholder `@current` validates, and in a real record it matches nothing.
- **When `self` is present and differs from the record's own content hash, the knowledge is `needs-review`**: its text
  changed after it was reviewed. A review without `self` makes no such check. `gates` never decides whether knowledge
  is current. It decides only whether knowledge can be kept under review.
- `intentset approve` writes both, beside the source pins, computed from the graph it already reads, in the knowledge
  drafts it is given, and `intentset approve --renew-review` writes them in the approved or deprecated knowledge it is
  given. Both are stable under approve's own edit.

### Renewing a review

A renewed review is a person's claim, so only the command a person runs writes one: `intentset approve <KB-…> --by
<name>` on a draft, or `intentset approve --renew-review <KB-…> --by <name>` on approved or deprecated knowledge, which
writes `reviewedBy`, `reviewedAt`, the pins, `self` and `gates` and leaves `status` and `approval` alone. Each refuses a
dirty tree. No other command prints a gate hash. `intentset context --json` and `intentset mcp`'s engineering tools
print each record's `contentHash`, which they printed before this ADR and keep printing (decided 2026-11-25); for
knowledge that is neither deprecated nor retired it is the own content hash `self` pins, since the two differ only by
`ending`. A `self` copied from it still needs a `gates` no command prints before the knowledge can be kept, and
`intentset review` lists the changed review, so the copy is caught in review rather than prevented.

### Migration re-pins what matched

`intentset migrate` re-pins, in every knowledge record it moves, each pin that matched the record it pins before the
move: a source pin (ADR 0025), and `self`. A pin is re-pinned when it equals the hash, of the review's kind, of the
pinned record's text before the move; `self` is always the own content hash. It is then replaced with the same kind of
hash of that record's text after the move. A pin that did not match stays as it is, so a stale review stays stale and
no review is created. `gates` needs nothing. `migrate` never writes a `self` or `gates` that was not there. No 0.2
reader read a `self`, so the move to 0.3 re-pins none; the step is there for every later move. A 0.2 review extension
that holds a `self` or `gates` held keys its reader ignored, and no 0.2 tool could have computed either, so the move
leaves both out of `review` and names the record: carried over, they would become pins, and a review current before
the move would need review after it.

`intentset review` ignores a review pin's difference from the base only when it is exactly what the move would write:
the base pin equals the hash, of the review's kind, of the pinned record's base copy; the head pin equals the same kind
of hash of that base copy as migrated; and the pinned record's head hash equals that same value, so the record changed
only by migrating. Any other difference is a change of review and is listed. A branch that migrates, edits a behavior
and copies its new hash into a pin is therefore listed, because the behavior's head hash is not its migrated base
copy's.

### When knowledge is kept under review

Knowledge is *keepable* when all of these hold:

1. it is `needs-review`, and at least one source it must pin has a pin that no longer matches;
2. no source it must pin is missing a pin;
3. `hash` names a kind the implementation reads;
4. `reviewedBy` and `reviewedAt` are present;
5. `self` is present and equals the record's own content hash;
6. `gates` is present and equals the current gate hash, so no source's audiences, visibility or availability changed;
7. every source it must pin is in the graph and is not `retired`.

"Sources it must pin" means `reviewSources`. A pin for any other ID is ignored, as it already is for currency.

Keeping is **opt-in, per request.** The request gains `keepUnderReview`, a boolean that is `false` when absent.
`true` publishes keepable knowledge. Any other value refuses the request with PUB001. When the request names `true`,
the index's request records it, last. Otherwise the index leaves it out. The CLI flag is
`intentset publish --keep-under-review`. The site, the chat's corpus and `intentset mcp` never set it.

**Keepable knowledge passes every check a current document passes.** The status, delivery, visibility, audience,
availability and flag checks of §1 run first, on the record as it is now. The needs-review step comes last, and only
there does keeping apply. The document then goes through the title check (PUB002), the Markset checks (PUB003, PUB004)
and the reference fixpoint (CORE008), against the current graph. Its provenance (`source`, `sources`,
`withheldSources`) is computed from the current graph for this request, as for any other document. That protects the
metadata block. The `gates` condition is what protects the body.

**Current documents never depend on kept ones.** A current document's title allowance and its link targets are the
documents published as current in the run. A kept document's are every document published in the run, current or
kept. So a current document that links a lapsed article is refused, as it is when that article is excluded, and a
request with `keepUnderReview` publishes exactly the current documents, byte for byte, that the same request without
it publishes. A kept document refused by §4 is counted under its refusal reason and is not written.

### Where kept documents go

Kept documents are written in a directory of their own, `under-review/`, beside the current documents and never among
them: `under-review/<ID>.md`, and `under-review/<ID>.html` and `under-review/<ID>.fragment.html` when HTML is asked
for. A reader that globs the top level of a publication's directory never meets one. The help file's `knowledge` entry
gives the path, `under-review/<ID>.md`. A relative link in a kept document whose target is a document published as
current is written with `../` before it, so it resolves from `under-review/`; a link to another kept document is
written as authored.

### The mark

The mark is `underReview: true`, written only where it applies and never as `false` or `null`, with the same shape
everywhere a reader meets it. Its other names are kept apart: the request's `keepUnderReview`, the index's
`keptUnderReview`, the help file's `withheldForReview`, the block's `changedSinceReview`, the help reader's option
`underReviewHelp` and its result `pendingReview`. None of them uses the name of the record's `intentset.review` block.

- **The document.** The publication block gains `underReview: true` after `reviewedAt`, then `changedSinceReview`
  before `publishedAt`, with two members: `changed`, the explained sources whose pins changed and that the projection
  admits, sorted, or `[]` when there are none; and `withheldChanged`, the number of explained sources whose pins
  changed and that the projection does not admit. Both count explained sources only, the same set `sources` and
  `withheldSources` describe, so `withheldChanged` never exceeds `withheldSources`. A changed governing rule that the
  knowledge does not explain is neither named nor counted. The HTML `<meta name="intentset-publication">` carries the
  same block.
- **The visible notice.** A kept document's generated Markset carries, right after its title heading, a fixed note,
  the same for every kept document, so it adds no prose a review did not see:

  ```markdown
  > [!NOTE]
  > Under review: what this article explains has changed since it was reviewed.
  ```

  Its HTML page shows the same note and carries `<meta name="robots" content="noindex">`. Its HTML fragment begins
  with the same note and is wrapped in one element carrying `data-intentset-under-review="true"`, the one thing a
  fragment carries that the document's block also says.
- **The help file.** A kept document's `knowledge` entry carries `underReview: true` and its `under-review/` path, and
  so does each tip it contributes. A tip carries the mark exactly when its knowledge entry does, and a reader refuses a
  file that breaks that.
- **The index.** `published` keeps meaning current documents only. Kept documents are listed, by sorted ID, in
  `keptUnderReview` after `excludedCounts`. The member is always written, `[]` when nothing was kept. They are
  published, so `excludedCounts` does not count them.
- **The library result.** `PublishResult.documents` keeps meaning current documents. Kept documents are returned in
  `PublishResult.keptUnderReview`, each with its `under-review/` path. So `customerTools`, and any consumer that treats
  `documents` as current, is unchanged and never sees them.

### Tips

- A kept document contributes its tips with `underReview: true`, except a tip keyed to a rule, which is held back. A
  rule tip is the reason a product gives for a refusal, and a reason that may be wrong is worse than none. Behavior
  and capability tips are carried, marked (maintainer decision, 2026-11-25).
- The tie-break, written once with ADR 0029: when two published documents tip the same ID, the tip from a current
  document wins over one from a kept document. Between documents of the same kind, the lower knowledge ID wins. Which
  of the request's audiences or roles admitted each document makes no difference.
- `help.json` lists, in `withheldForReview`, the rule IDs whose tips were held back and that no current document tips.
  The list is sorted and always written, `[]` when empty, so a coverage report does not count them as tips nobody
  wrote. ADR 0011 already lets the help file name an explained ID whatever its visibility. The index never lists them.

### Readers

- The help profile is `intentset/help/0.3`, which the move already introduces, and help/0.3 is closed, so an older
  reader refuses the whole file and never shows an under-review tip as current.
- `@intentset/help` adds `underReviewHelp: "include" | "exclude"` in `ReviewOptions`, which `tipFor`, `articles`,
  `helpForPage` (through `PageOptions`), `bindTips` (through `BindOptions`) and `watchTips` (through `WatchOptions`,
  which extends `BindOptions`) take. **`exclude` is the default**, because a product's own renderer may not show the
  mark, and the spec requires that a shown item under review be marked. Under `exclude`, a tip or article under review
  is left out and its ID goes to `pendingReview`, never to `missing`. Under `include` it is returned with
  `underReview: true`. An ID in `withheldForReview` goes to `pendingReview` in both modes.
- `reviewStateFor(help, id)` says `current`, `under-review`, `held-back` or `none` for a control ID, so a coverage
  report built per control never counts a held-back tip as missing. `tipFor` alone cannot measure coverage, and the
  README says so.
- The default render sets `data-help-tip` to the tip's text in both modes and adds `data-help-under-review="true"` on a
  marked tip. `bindTips` never removes an attribute. `watchTips`'s default render and unrender pair snapshots and
  restores `data-help-under-review` with the other two attributes, so disposing a watch still leaves the page as it
  found it.
- A runtime that shows a tip or an article marked `underReview` MUST show that it is under review.

### Retrieval

A kept document is never chunked, and a retrieval system MUST NOT index a document whose block carries `underReview`,
whatever chunks it was given. Its page says `noindex`, and its place in `under-review/` keeps it out of a top-level
glob. Core §9 says answers cite eligible knowledge, and text waiting for review is not that. The MCP server and the
site's knowledge pages publish with the default request, so the chat's corpus is unchanged (RULE-ASK-PUBLISHED-ONLY).

### Diagnostics and validation

- A requested ID that is kept is published, so it gets no CORE008. A requested ID left out as `needs-review` keeps
  CORE008, and its remediation names the first condition of the seven that failed, or says the knowledge was keepable
  and the request did not ask. Like every publication diagnostic, it names an artifact outside the projection by ID
  only. No new code is added.
- At L4 (`intentset validate`), approved knowledge whose `self` no longer matches is CORE008 with the reason "its own
  text changed since review" and field `/intentset/review/self`. Keepability never satisfies L4, because L4 asks
  whether knowledge can be published as current.

### Who may write a review

A review is a claim a person makes, like an approval. Core §10 gains a sentence: an agent MUST NOT write or change
`reviewedBy`, `reviewedAt` or `review` (its pins, `self` and `gates` included) unless the review workflow it runs gives
it every value. A hash copied from a tool's output into a pin claims a review nobody made. The agent guide's Never list
says the same, `intentset approve` is the only command that writes a review, and no command prints a gate hash.
`intentset context --json` prints a record's `contentHash`, which for knowledge that is neither deprecated nor retired
equals its own content hash; `intentset review` is what catches a pin copied from it. `intentset review` lists every knowledge record whose review changed against the base, in the section that
already lists approvals, and leaves out exactly a migration's re-pins, as defined above.

### Export

Each `reports.knowledge` entry gains `self`: `unchanged`, `changed` or `unpinned`. Without it, a `needs-review` entry
with empty `changed` and `missing` and a named reviewer would go unexplained (design invariant 6). The exported
`review` leaves out `self` and `gates`. `self` hashes the record's content, which includes `explains` entries and `tips`
keys that the export withholds. `gates` hashes a small set of audience, visibility and availability values, which a
reader could recover by trying every combination. ADR 0025 already rejected exporting a hash of withheld content,
because a hash confirms a guess.

## Rejected

- **Take the previous publication as an input and copy its bytes forward** (the issue's proposal). Nothing ties
  bytes the caller supplies to the review the record names. It also makes the output depend on saved state, and makes
  an API adopter store that state.
- **Copy the previous block's provenance** and filter out what has left the projection. The block would describe an
  older graph and would be safe only because of the filter.
- **`since`, the time the lapse was first seen.** Without a previous input it can only be invented from `publishedAt`.
  `reviewedAt` already dates the reviewed text.
- **Keep when only `self` matches, without `gates`.** The prose of an article whose source was made restricted, taken
  out of the reader's edition or narrowed to other audiences would keep reaching readers while no person had seen the
  change (design invariant 4).
- **Leave `audiences` out of `gates`.** Publication checks audience only on the knowledge, never on its sources, so a
  source narrowed to other audiences would keep its article published under review, unseen.
- **Keep only when every changed source is admitted by the projection.** In the usual layout customer knowledge
  explains internal behaviors, so customer publications would never keep anything.
- **Decide per tip, holding back every tip whose key or governing rule changed.** The maintainer chose to hold back
  rule tips only (2026-11-25). A product that wants none passes `exclude`.
- **Leave `spec` and `profile` out of `content-v1` and `self`.** It would change what every existing `content-v1` pin
  means, and whole-file pins can never leave anything out.
- **Let `migrate` write a `self` or `gates` that was not there.** It cannot know which text was reviewed.
- **Ignore a head pin that equals the head record's hash when the base copy declares an earlier spec.** A branch that
  migrates, edits a source and copies its new hash into the pin would pass unlisted.
- **Print the values a renewed review would write from `intentset context`.** The agent guide sends agents to
  `context` before every change, so it would hand them a ready-made review to paste. `context --json` keeps the
  `contentHash` it already printed, which for knowledge that is neither deprecated nor retired is the value `self`
  pins, but no gate hash, so it never holds a whole review.
- **Keep `ending` in `self`.** Deprecating reviewed knowledge would unpublish it until it is reviewed again, although
  its text did not change.
- **Two shapes under the name `underReview`**, or **`review: { status: under-review }`** as the mark. A consumer that
  checks one shape against the other treats a kept document as current, and a status value reads like the record's
  `intentset.review` block.
- **A `kept-under-review` exclusion reason.** The document is written, and counting it as excluded makes the counts
  disagree with the files.
- **Put kept documents in `index.published` or `PublishResult.documents`, or beside current ones at `<ID>.md`.** An
  older index reader, `customerTools` or a consumer that globs the directory would treat them as current.
- **Let a current document link a kept one, or take its title allowance from one.** The flag would change current
  output.
- **Mark a kept document only in its metadata.** The publisher's own Markset and HTML would show it with no visible
  mark, against the rule it sets for consumers.
- **Write `keptUnderReview` and `withheldForReview` only when they have entries.** Readers would have to interpret an
  absent member.
- **Name held-back tip keys in `index.json`.** The index never names a record the projection does not admit.
- **`include` as the help reader's default**, **put "Under review:" into `data-help-tip`**, or **let `bindTips` clear
  attributes.** A product whose renderer ignores the mark would show stale help as current, its own tooltip reads
  `data-help-tip` as the tip text, and clearing erases attributes an author or another module set.
- **Chunk kept documents, or let the chat or customer MCP mode serve them.** Answers cite eligible, reviewed knowledge.
- **Make keeping the default.** Publication fails closed (design invariant 4).
- **Export `review.self` and `review.gates`.** Both are hashes over content the export may withhold (ADR 0025).
- **A new catalog ID (P07).** The catalog lives in the frozen handoff. The cases are P04's subject: knowledge whose
  sources changed after review and that is not published as current.

## Consequences

- An adopter that serves help from an API gets lapsed help back with one request field and stores nothing between
  runs. An adopter that commits its publication can drop its carry-forward script, and its committed output is a
  function of the model.
- **An author who edits a lapsed article before it is reviewed again takes its help out of the product until the
  review** (maintainer decision, 2026-11-25). The edit and the renewed review land in one reviewed change.
- **Knowledge edited after a review that carries `self` is no longer published as current, and at L4 it is a CORE008
  error.** It applies only to reviews that carry `self`, which only `intentset approve` writes.
- **A source whose audiences, visibility or availability changes takes its knowledge out until it is reviewed
  again**, as before, even under `keepUnderReview`.
- A review written before 0.3, including every migrated one, has no `self` or `gates`, so it is never kept until a
  person reviews it again, with `intentset approve`, or `intentset approve --renew-review` on approved knowledge.
- **Not breaking on its own:** no existing case changes its `valid` or `diagnostics`. Every new member is opt-in,
  always written as an empty collection, written only when it applies, or exists only in 0.3 profiles. It ships inside
  the move to `0.3`. The export is `0.7` (ADR 0025), and `reports.knowledge.self` is one more required member of it.
- A request with `keepUnderReview` publishes the same current documents, byte for byte, as the same request without
  it. A run that keeps nothing writes the same bytes in every file, except that the index's request records
  `keepUnderReview: true`.
- Codes: none added. CORE001 gains two fields, CORE008 gains remediation text, and PUB001 gains one condition (a
  non-boolean `keepUnderReview`).
- Intentset's own model gains BEH-PUBLISH-UNDER-REVIEW, implemented by SLICE-PUBLISHER alone, and its verification,
  both as drafts. BEH-REVIEW-PINS, BEH-HELP-TIPS, BEH-APPROVE, BEH-REVIEW-APPROVALS, BEH-AGENT-GUIDE, BEH-ATLAS and
  BEH-MIGRATE are revised and return to draft for a maintainer to approve again; BEH-HELP-WATCH, already a draft, is
  revised.
