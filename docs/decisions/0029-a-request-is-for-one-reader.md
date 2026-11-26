# ADR 0029: A publication request is for one reader, with every audience and role they hold

**Status:** accepted, 2026-11-25 (issue #144). Part of the move to `0.3`, with ADR 0023, ADR 0024, ADR 0025 and
ADR 0026. Its change to the request is made together with ADR 0027 (issue #142), and ADR 0028 (issue #143) tests a
slice's availability with the function this ADR factors out. Builds on
[ADR 0011](0011-tips-on-knowledge-and-the-help-file.md), [ADR 0019](0019-a-publication-names-its-snapshot-once.md)
and [ADR 0021](0021-the-snapshot-has-a-file-of-its-own.md). It adds no diagnostic code.

## Context

A publication request names exactly one value for each of `audience`, `product`, `release`, `role` and `edition`
(publication §1, `checkRequest`), and a missing one is refused rather than read as "any" (Core §7). A reader can be in
two audiences or hold two roles at once, such as a teacher who is also a site administrator, and needs the help for
both. A product has two ways to get it today, and neither works well:

1. **Publish once for every combination.** The number of runs grows with the product of roles and audiences. This
   repository's own `site/knowledge.ts` already loops over audience × role.
2. **Publish once per role and merge at runtime.** The product then has to de-duplicate documents and chunks, choose
   between two tips for one ID, and write one `help.json`. The publisher already defines all of that for a single
   run: when two documents tip one ID, the lower knowledge ID wins (§5). A merge also gets one thing wrong that no
   amount of care fixes. §4 checks a document's links against what the same run publishes
   (`references.ts`, `published.has`). A teacher document that links an administrator-only one is refused in a
   teacher run and again in an administrator run. No merge of the two can contain it, although a reader who holds
   both roles may read both.

The issue proposed letting `role` and `audience` be lists, with `help.json` carrying a list only "when the request
gave lists". That makes two equal requests write different bytes, and gives every reader a string-or-list type.

The second point sets the rest of the design. **A run with several roles is not the union of single-role runs.** It
can publish a document that every single-role run refuses. Whatever it publishes is safe only for a reader who holds
every role it was made for, and its files have to say so in a form no reader can mistake for something weaker.

Two defects already on `main` sit on the same path, and this change makes both more likely to bite:

- **The title check allows too much.** §4 allows an outside artifact's title in a body "unless a published artifact
  has the same title". `publish.ts` builds that allowance from every projection candidate, including candidates
  refused later for a reference or for their Markset. So a document can carry the title of an internal record because
  a document that was then refused shared it (design invariant 4). A run for several roles admits more candidates,
  and refuses more of them through cross-role links.
- **The document block narrows `flags`.** A generated document's `availability.flags` lists only the flags its
  knowledge requires, but its links were checked against everything the run published under all of the request's
  flags. A document that requires no flag and links a flag-gated one says `flags: []`, which invites a retrieval filter
  to serve it to a reader without the flag. The block's narrowing of `role` would cause the same leak, which is why
  this ADR does not narrow it. `flags` is the same case, already shipped.

## Decision

**A request is for one reader. `audience` and `role` may each be one value or a non-empty list of every audience and
role that reader holds. A record is eligible when it lists at least one of them, and every later step runs once over
what that admits. Every file of a publication names the whole entitlement it was made for: the request's audiences,
roles and flags as sorted lists. Those lists are held all-of: the files are served only to a reader who holds every
value named.**

```json
{"visibility":"customer","audience":"teacher","product":"PRD-LANTERN","release":"pilot-1",
 "role":["teacher","administrator"],"edition":"standard","flags":[]}
```

- **Input.** `audience` and `role` each take a non-empty string, or a non-empty list of non-empty strings. The keys
  stay singular, and each dimension has one input form. A list is read as a set: order and repeats mean nothing, so
  `"teacher"`, `["teacher"]` and `["teacher","teacher"]` are the same request. `visibility`, `product`, `release` and
  `edition` stay single. A reader is on one product, one release and one edition at a time, and Core §9 abstains on an
  unknown release, which only works for a single release.
- **Refusal (PUB001; every problem is reported at once, any one of them refuses the whole request, and nothing is
  counted).** The request is refused for a missing, empty-string or empty-list `audience` or `role`; a list member that
  is not a non-empty string; a list in `product`, `release` or `edition`, even a list of one; and each member the
  registries do not declare, with one diagnostic per unknown member, in sorted order. A known member never rescues a
  list that holds an unknown one. No new code.
- **Eligibility.** At least one of the request's audiences is in the knowledge's `audiences`, and at least one of its
  roles is in `availability.roles`. Every other condition of §1 is unchanged. This is Core §7's "OR within an array",
  applied from the request's side. The eligible set is exactly the union of what each pair of one audience and one role
  admits.
- **One run.** The title check and reference check of §4, and the help file of §5 with its tie-break, run once over
  that set. A tip goes to the lower knowledge ID whichever role or audience admitted each document, and ADR 0027's
  preference for a current document over one kept under review comes before that.
- **The title check allows only what is still published.** The title allowance and the reference check iterate
  together: a document refused for any reason no longer allows its title, and the checks repeat over what remains until
  a round refuses nothing. This corrects the code to what §4 already says.
- **Every file names the whole entitlement.** The generated document's `intentset-publication` block (and so its HTML
  meta and every chunk), `help.json` and the index's `request` write `audience`, `role` and `flags` as sorted,
  de-duplicated lists, for every publication, single-valued ones included. They are the request's values, not the part
  of them the knowledge lists. Every document of a run therefore carries the same `audience` and `availability` as the
  run's help file and index. Equal requests write equal bytes, readers have one type, and the index's request stays a
  valid request, so it replays.
- **All-of, stated where a reader will look.** Core §7's "OR within an array" reads a record's `availability`. A
  publication's `audience` and `availability` are a different object: a statement of what its reader holds. Every
  list in them is held all-of, as `flags` already is. Publication §1 says so, Core §9 says so in one sentence, and
  `@intentset/help` gains `servedTo(file, reader)`, so a product tests a help file or a document block by calling a
  function rather than by writing an `includes`. The reader it takes carries a visibility clearance as well as
  audiences, roles, flags, product, release and edition, and `servedTo` is false unless the file's `projection` is
  among the reader's visibilities: an internal help file whose other values match a customer is not served to that
  customer. The keys stay singular, as decided: the plural `audiences` and `roles` are the record's OR-read fields,
  and an output that shared their names would invite the wrong reading.
- **The index says what it is.** The index gains a first member, `profile: "intentset/publication-index/0.3"`, because
  its request changes shape in this release. A reader refuses any other profile and any member the spec does not
  list, so an older reader cannot misread a list-valued `request.role`. Every record whose visibility the projection
  admits is counted once: in `published`, in `keptUnderReview` (ADR 0027) or under one `excludedCounts` reason.
- **The help file is closed.** Every member of the table is present, a collection always written (`[]` or `{}`), and
  a reader refuses a file, or any object in it, holding a member the table does not give it, so a member added later
  makes an older reader refuse the file rather than show too much.
- **The caller states the entitlement.** Publication does not authenticate roles, and documentation availability
  never grants runtime access (Core §9). A caller MUST name only roles and audiences the reader holds. A product MUST
  NOT serve any file of a publication to a reader who lacks a value it names, and publishes once for each combination
  it serves. The rule is the same for every publication, single-valued ones included. A product that serves a
  publication to readers it does not tell apart, such as a public site, is saying by doing so that every one of them
  holds what the request names.
- **CORE008** for an explicitly requested ID excluded by audience or role names only the request's values. For one
  value it keeps today's text. For several it says "it is written for none of the audiences engineering, product" or
  "it is available for none of the roles administrator, student". It never names the knowledge's own lists.
- **`readHelp`** refuses a file whose `audience` or `availability.role` is not a non-empty list of strings in strictly
  ascending code-unit order, or whose `availability.flags` is not such a list (empty allowed). A 0.3 reader already
  refuses every profile but `intentset/help/0.3` (5bf83c3), so no file with string values reaches this check.
- **The CLI** takes `--audience` and `--role` repeatedly on `publish` and `mcp --mode customer`, the way it takes
  `--flag`. Values are not split on commas. A refused value containing a comma gets a hint to repeat the option. The
  summary line names the normalized sets.
- **The publisher factors the dimension tests** into `availabilityReason(availability, request)` and
  `audienceReason(audiences, request)`, which take a `CheckedRequest`. ADR 0028 tests a slice's availability with the
  first, so a surface and a document are gated by one function. It returns `availability-missing` for a record with no
  `availability`, so a caller that treats any non-null result as excluded fails closed.

## Rejected

- **A string or a list depending on the request** (the issue's form). Equal requests would write different bytes,
  and every reader would carry a two-shape type whose list branch rarely runs.
- **A new key for the entitlement**, such as a top-level `reader: {audiences, roles}`, or a `match: all` marker. The
  maintainer kept the keys singular. The all-of reading is instead stated in publication §1 and Core §9, written the
  same way for `flags` (which has always been all-of in a publication), and implemented once in `servedTo`.
- **Plural output keys `audiences` and `availability.roles`.** They would share their exact names with the record
  fields that Core §7 reads as OR, and the index's request would no longer be a request.
- **`mergeHelp` in `@intentset/help`.** A product would still merge documents and chunks, and a merge of single-role
  runs cannot recover a document that §4 refused in each of them.
- **Publishing per combination.** It is the workaround the issue exists to remove.
- **Lists in `product`, `release` or `edition`.** A reader is on one of each.
- **The matched subset in each document's block** (the roles and audiences the knowledge lists). It labels a
  document safe for a reader it may not be safe for, and makes documents from different role sets byte-identical,
  which invites exactly the cross-set reuse this ADR forbids. The same argument moves `flags` to the whole set.
- **Separate plural input keys, `roles` and `audiences`, beside the singular ones.** A second input form, and a
  refusal for naming both, buy nothing a string-or-list value does not already give.
- **Reading an empty list as "any" or "none".** `flags: []` is the only empty value that means none.
- **A tie-break that prefers the knowledge written for more of the reader's roles.** A tip would change when an
  unrelated record's availability changed. Lower ID wins, which stays deterministic.
- **Making the Atlas readiness check build its request from every audience and role the knowledge lists.** It would
  quietly redefine readiness. The Atlas runs the projection alone, with the knowledge's own first role and audience,
  and never the reference check, so no list request could make that knowledge more eligible than the page reports.

## Consequences

- **Breaking, inside the `0.3` move.** Every request that conformed still conforms. The outputs change shape:
  `audience`, `availability.role` and, in a document's block, `availability.flags` now name the request's lists in the
  document block, `help.json` and the index. One existing case changes its expected output (the snapshot case pins
  `audience: teacher` and `"audience":"teacher"`). A document whose title check passed only because a refused
  candidate shared the title is now refused (PUB002), which no existing case exercises. The publication and help
  profiles already move to `0.3` in this release, so this adds no second move. The export does not change: no
  publication data is in it.
- **Publication §5 is corrected in the same commit.** It says `help.json` is written "with its keys sorted"; the
  writer and the suite write the table's member order, which the text now says.
- **The conformance schema** widens `request.audience`, `role`, `product`, `release` and `edition` to a string or a
  list, with no `minItems`, as `selector` is widened, so the suite can hold the refusals for empty lists and for a list
  in a single-valued dimension.
- **TypeScript (a minor bump before 1.0, released with `0.3`).** The publisher gains `CheckedRequest`, with
  list-valued `audience` and `role`, which every stage after `checkRequest` reads, and which ADR 0027 extends with
  `keepUnderReview`. `IndexedRequest`, `PublicationMeta`, `HelpFile` and `@intentset/help`'s `Help` carry lists, and
  the publisher exports `PUBLICATION_INDEX_PROFILE`. `@intentset/help` adds `Reader`, `servedTo` and a shape check,
  and no dependency. `@intentset/mcp` refuses an index whose profile or members are not the spec's, and a document
  whose block names another entitlement than its index: `audience`, `product`, `release`, `role`, `edition` and
  `flags` equal, since the block names the request's whole flags (the maintainer's decision, 2026-11-25). A root test holds the publisher's help-file types to
  `@intentset/help`'s and checks that every published help file passes `readHelp`.
- **The CLI.** A repeated `--role` or `--audience` used to keep the last value silently. It now publishes for the
  whole set. A wrapper that passes a default and then an override gets the union, so the CHANGELOG says so.
- **The Atlas and the site** do not change in behavior; the Atlas's readiness page only types the single-valued
  request it builds. `site/knowledge.ts` keeps its per-combination loop: collapsing it
  into one run could release a record that every single run refuses through a cross-role link, which would change what
  the site releases.
- **ADR 0027** adds `keepUnderReview` to the same request. The two ADRs change `REQUEST_KEYS`, `CheckedRequest`, the
  index request and the conformance schema once, and publication §1 names every key in one paragraph. **ADR 0028**
  chooses a surface's lead articles over the whole run, as tips are chosen, with no per-role lead, and tests a slice's
  availability with `availabilityReason`.
- Intentset's own model gains two draft behaviors, BEH-PUBLISH-READER on the publisher slice and BEH-HELP-READER on
  the help slice, each with its own verification. One slice implements each behavior.
