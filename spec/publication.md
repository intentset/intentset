---
title: Intentset Publication Profile v0.4
id: intentset/publication/0.4
status: draft
revision: 2026-11-27
implementation: 0.18.0
---

# Intentset Publication Profile v0.4

**Extends:** [Core §9](core-0.4.md#9-markset-profiles-and-document-publication), and follows Core §1's change policy.

Publication turns reviewed knowledge, the explanations a product's readers are given, into documentation and in-app
help for one reader, in one or more audiences and roles, on one release, and leaves out everything that reader may
not see. It is not deployment: nothing here ships a product. Core §9 names the generated publication profile and lists the provenance a published knowledge
document must retain. This note fixes the fields that carry it, the review record that decides `needs-review`, and the
diagnostics a publisher reports. MUST, MUST NOT, SHOULD and MAY are used as in Core §1.

## 1. Request and projection

A publication request is for one reader. It names `visibility`, `audience`, `product`, `release`, `role`, `edition`
and `flags`, and MAY name `ids` (knowledge IDs; omitted means every eligible one) and `keepUnderReview` (`true` or
`false`; `false` when absent; §3). `audience` and `role` are each one
value or a non-empty list of values, for a reader who is in more than one audience or holds more than one role.
`visibility`, `product`, `release` and `edition` are one value each, and a list in any of them, a list of one
included, MUST refuse the request. A list is read as the set of its values: its order and repeated members change
nothing, and a list of one value is the same request as that value alone. Every other field is required: a missing
one, and an empty `audience` or `role` list, MUST refuse the request rather than be read as "any", and `flags: []`
is the only way to say "no flags". A `keepUnderReview` that is not a boolean MUST refuse the request. Each value, every member of a list included, MUST be one the registries declare
(the product: a product artifact in the snapshot). An unknown value, such as an unknown release label or one unknown
role in a list, MUST refuse the whole request rather than match nothing or be dropped.

| Projection | Admits | Requires |
|---|---|---|
| `public` | public | nothing more |
| `customer` | public, customer | nothing more |
| `internal` | public, customer, internal | explicit internal authorization |
| `restricted` | all four | explicit internal and restricted authorization |

A knowledge artifact is eligible only when all hold: type `knowledge`; status `approved` or `deprecated`;
no artifact it `explains` says `delivery: planned` (Core §7: planned work is not current, and
prospective documentation belongs only in a separately labeled roadmap projection, which v0.4 does not define);
visibility admitted; at least one of the request's audiences in `audiences`; `availability` present; the request's
product, release and edition each in the corresponding list, and at least one of the request's roles in
`availability.roles`; every flag in `availability.flags` named by the
request; and its review current (§3), or, when the request names `keepUnderReview: true`, the knowledge keepable (§3).
Knowledge published because it is keepable is *kept under review*: it is marked as such (§2, §5) and is never
published as current. Everything else is excluded. An excluded artifact the request named in `ids` is CORE008.
Knowledge kept under review is published, so a request that names it is not CORE008. When the artifact's visibility is outside the projection, or no artifact has the ID, the diagnostic MUST be
the same in both cases and MUST NOT carry a path.

A request that names several audiences or roles makes eligible exactly the knowledge that a request naming one of
its audiences and one of its roles, and otherwise the same, would make eligible. Every later step runs once over that
set: the title and reference checks of §4, and the help file of §5 with its tie-break. A document may therefore link
to one that only another of the request's roles admits, and such a run can publish a document that every
single-role run refuses. Keepability (§3) does not depend on the request: a document kept under review in a run for
several audiences or roles is checked against everything that run publishes, carries the run's whole entitlement like
any other document, and is subject to the same serving rule.

Every file of a publication is therefore for one reader: its documents, their HTML and chunks, its help file and its
index. That reader is in every audience it names, holds every role and every flag it names, and is on its product,
release and edition. The lists in a publication's `audience` and `availability` are held all-of. Core §7's "OR
within an array" reads a record's availability, never a publication's: a publication that names the roles
`administrator` and `teacher` is not for a reader who holds only one of them. A product MUST NOT serve any file of a
publication to a reader who lacks a value it names, and publishes once for each combination of audiences, roles and
flags it serves. The request is the caller's statement of the reader's entitlement. Publication does not
authenticate it, a caller MUST name only what the reader holds, and documentation availability never grants runtime
access (Core §9). A product that serves a publication to readers it does not tell apart, such as a public site, is
stating by doing so that each of them holds what the request names.

## 2. The generated document

A generated document is UTF-8 Markset. Its frontmatter holds `markset: true` and one top-level key,
`intentset-publication`; it MUST NOT hold an `intentset` key, so it is never read as a canonical record. The line
after the frontmatter MUST be `<!-- Generated by intentset publish from <ID>; do not edit. -->`. The body MUST be the
knowledge body unchanged, preceded by one blank line when it does not begin with one, but for what a document kept
under review adds below. The published path is `<ID>.md`.

| Field | Value |
|---|---|
| `profile` | `intentset/publication/0.4` |
| `derived` | `true` |
| `projection` | the request's visibility; the document is as restricted as its projection |
| `source` | `id`, `revision` (null when undeclared), `sourceHash` of the knowledge; `path` only when the projection admits internal |
| `sources` | `{ id, revision, sourceHash }` for each explained artifact the projection admits, sorted by ID |
| `withheldSources` | the number of explained artifacts outside the projection; they are counted, never named |
| `audience` | the request's audiences, a list sorted by code unit without repeats |
| `availability` | `product`, `release` and `edition` from the request; `role`, the request's roles; and `flags`, the request's flags; each list sorted by code unit without repeats |
| `reviewer`, `reviewedAt` | the knowledge's `reviewedBy` and `reviewedAt` |
| `underReview` | `true`, only on a document kept under review (§3) |
| `changedSinceReview` | only on a document kept under review: `changed`, the explained sources whose pins changed and that the projection admits, sorted (`[]` when none), and `withheldChanged`, the number of explained sources whose pins changed and that the projection does not admit |
| `publishedAt` | the publication timestamp, an input to the publisher |

A document that is not kept under review MUST NOT carry `underReview` or `changedSinceReview`, and `underReview` is
never written with any value but `true`. `changed` and `withheldChanged` count explained sources only, the same set
that `sources` and `withheldSources` describe, so `withheldChanged` never exceeds `withheldSources`. A changed
governing rule that the knowledge does not explain is neither named nor counted. `sources` carries each source's
current hash; `underReview` says the text was reviewed against earlier versions of those sources. A reader MUST NOT
present a document that carries `underReview` as current.

A document kept under review is written apart from current documents, under `under-review/` (`under-review/<ID>.md`,
and its HTML beside it there), and is never written at a current document's path. Its Markset carries, right after
its title heading (first, when the body has none), this note and nothing else that its knowledge does not hold:

```markdown
> [!NOTE]
> Under review: what this article explains has changed since it was reviewed.
```

A relative link in it whose target is a document published as current is written with `../` before the target, so
it resolves from `under-review/`. Its HTML page shows the note and carries `<meta name="robots" content="noindex">`.
Its HTML fragment, when one is written, begins with the note and is wrapped in one element carrying
`data-intentset-under-review="true"`: the one mark a fragment carries, its block otherwise travelling with the
document.

`audience` and `availability` name the whole entitlement the document was published for (§1), not the part of it
the knowledge lists. The document's references and titles were checked against everything published for that
entitlement, so a narrower label would invite a reader it is not safe for. Every document of a run carries the same
`audience` and `availability`, which are those of the run's help file and the request its index records. A request
for one audience or role writes a list of one.

A generated document MUST NOT carry the snapshot it was published from. The snapshot is the same for every document
in a run, and the graph hash moves with every record in the model, so a document that carried it would change
whenever any record did. The run names its snapshot once, in the snapshot file (§6). What a document was made from is
pinned by the `sourceHash` of its knowledge and of each source it names (ADR 0019, ADR 0021).

Fields appear in this order. Strings are plain only when they cannot be read as another type, and are otherwise
single-quoted; sequences are indented under their key. An HTML rendering SHOULD carry the same block, as canonical
JSON, in `<meta name="intentset-publication">`. The document MUST parse as Markset without errors and MUST
NOT contain a `:::` directive outside Markset's vocabulary. Retrieval chunks of a document MUST carry its
`intentset-publication` block unchanged. A document kept under review MUST NOT be chunked, and a retrieval system MUST
NOT index one, whatever it was given.

An HTML rendering of a document, a page or a fragment, is rendered from the document's Markset and MUST NOT let raw
HTML in the source pass through. A link or image URL taken from the source MUST have the scheme `http`, `https` or
`mailto`, or none: a relative path, a protocol-relative `//host/path` or a `#` fragment is allowed. The scheme is read
as a browser reads it: case-insensitively, with ASCII tab, line feed and carriage return removed wherever they are,
and control characters and spaces before it skipped. A link whose URL is refused keeps its text, and an image its
alternative text. A diagram or chart the renderer draws MAY be embedded as a `data:image/svg+xml` image that the
renderer builds, with the source's text escaped in it, so a host whose Content Security Policy restricts `img-src`
must allow `data:` for those images. The Markset document itself keeps the knowledge body unchanged; only its HTML is
held to this.

A publisher MAY also render a document as an HTML fragment, for a product that shows it inside its own interface. A
fragment is what the page holds as the document's content, rendered the same way and so sanitized the same way. It
MUST NOT contain a stylesheet, an `<html>`, `<head>` or
`<body>` element, or the `intentset-publication` block, which travels with the document rather than in its HTML. It
MUST leave out the document's title heading, the first level-one heading at the top level of the body, and keep every
other heading, a later level-one heading included; each heading keeps the id it has in the page. The reference
implementation writes a fragment as `<ID>.fragment.html`, under `intentset publish --html=fragment`, and a page as
`<ID>.html` under `--html`, and those of a document kept under review under `under-review/`. A fragment is held to the same exclusions as every other output: no excluded source's title
or path, and no snapshot (§6).

## 3. Review record and needs-review

A review is `reviewedBy` and `reviewedAt` on the knowledge plus `review` (Core §9, ADR 0025), which pins a hash of
each source as it was when the knowledge was reviewed:

```yaml
review:
  sources:
    BEH-ASMT-SCHEDULE: 4fede99f81c7...
    RULE-ASMT-FUTURE: a89cf09ddc01...
  hash: content-v1                     # what the pins hash; absent means content-v1
  snapshot: <commit or graph hash at review>   # optional, informative
  self: 9a41c7...                      # optional: the knowledge's own content hash at review (ADR 0027)
  gates: 51be02...                     # optional: who could see each source at review (ADR 0027)
```

`hash` names what every pin in the record holds (ADR 0018, ADR 0025):

- **`content-v1`, the content hash, and the default.** SHA-256 over the canonical JSON (ADR 0005) of an object with
  three members:
  - `frontmatter`, the source's whole parsed frontmatter, with `markset: true` read as `markset: 0` (the two declare the
    same thing, Core §3), without, under `intentset`, `status`, `delivery`, `reviewedBy`, `reviewedAt`, `approval`,
    `formalizes` and `review`, and without the `intentset.org/review` extension, and without `extensions` when nothing
    else is in it;
  - `body`, everything after the frontmatter, as written;
  - `ending`, the status when it is `deprecated` or `retired`, and absent otherwise.

  A record's *own content hash* is its content hash computed without `ending`. It is what `review.self` pins, so
  deprecating reviewed knowledge does not count as editing its text.

  Approving, implementing or releasing a source, setting its `delivery`, recording its own review, writing the basis
  of its approval (`approval`, Core §7) or naming the outside requirement it formalizes (`formalizes`, Core §5) leaves
  the knowledge current: none of them changes what the source promises (ADR 0018, ADR 0020). Every other edit to the source makes it `needs-review`: its title, body, links, availability and
  any other frontmatter, and a status that says it is going away. A change in key order, quoting or indentation does
  not, because the frontmatter is hashed as parsed, and neither does moving `markset: 0` to `markset: true`. A review
  with no `hash` pins this kind.
- **`file-v1`, the whole file.** Each pin is the SHA-256 of the source file's bytes, its `sourceHash` (ADR 0005), so
  any edit to the source, its status included, makes the knowledge `needs-review`. Before `0.3` this was the kind of a
  review with no `hash`; `intentset migrate --to 0.3` writes `hash: file-v1` on each such review, so none changes what
  it pins.
- **Any other value** is a kind the implementation does not read: no pin matches, so the knowledge is `needs-review`.

The *gate hash* of a knowledge record is SHA-256 over the canonical JSON (ADR 0005) of an object with one member per
source the review must pin (below), keyed by ID. Each member is `{ "audiences": <audiences, sorted>, "visibility":
<visibility>, "availability": <availability as parsed, or null when absent> }`, or null when no record has that ID. It
is what `review.gates` pins. It covers neither `spec` nor `profile`, so no migration moves it.

The sources a review MUST pin are those the knowledge `explains` and the rules in `governedBy` of each explained
behavior. The knowledge is `needs-review`, and MUST NOT be published as current, when any such source's current hash,
of the record's kind, differs from its pin or the source is gone; when a pin is missing; when `reviewedBy` or
`reviewedAt` is absent; or when `self` is present and differs from the knowledge's own content hash. A review without
`self` makes no check of the knowledge's own text. A pin for an ID the review need not pin is ignored. `gates` never
decides whether knowledge is current.

**Keepable.** Knowledge is *keepable* when all of these hold: it is `needs-review`; at least one source it must pin
has changed; no pin is missing; `hash` is a kind the implementation reads; `reviewedBy` and `reviewedAt` are present;
`self` is present and equals the knowledge's own content hash; `gates` is present and equals its current gate hash;
and every source it must pin is in the graph and not `retired`. Its body and tips are then exactly the text the review
covered, and its sources changed what they promise but not who may see them. A request with `keepUnderReview: true`
publishes keepable knowledge as an eligible document after every other check of §1 has passed on the record as it is
now. §4 then runs on the document against the current graph and every document published in the run, current or
kept. The document is marked `underReview` (§2), and so are its help entry and tips (§5). Knowledge that is
`needs-review` and not keepable is excluded as `needs-review`, whatever the request says. Once the review is renewed,
the knowledge is current and is published with no mark.

**Moving and renewing.** A move to a new `spec` (Core §1) rewrites `spec` and `profile`, which both kinds cover, so it
re-pins each pin that matched before it: a pin equal to its source's hash, of the record's kind, as the source was
written at the version it declared becomes the same kind of hash of the source as moved. The record's kind is the one
its own version read: before `0.3` a review with no `hash` pinned the whole file, and a `hash` other than `content-v1`
was a kind no pin matched. A pin that did not match is left as written, and only the pins of a knowledge record the
move rewrites, or of one already at the new `spec`, are re-pinned. A review's `self` is re-pinned the same way when
it equals the knowledge's own content hash as written and the knowledge's own version read `self` (`0.3` or later), so
the move to `0.3` re-pins none and leaves out of `review` a `self` or `gates` an earlier review extension held (Core
§1); `gates` is never re-pinned, because no move changes it. A
review current before the move is so after it, with no step of its own, and a stale review stays stale. A review is
renewed by the person reviewing, as a change to the knowledge (Core §7): `reviewedBy`, `reviewedAt`, a pin of each
source at its current hash, `self` and `gates`, with `status` and `approval` left as they are.

In conformance fixtures only, a pin of the literal `@current` stands for the source's hash, of the record's kind, in
the case's own tree and is bound before projection. Unbound, it equals no hash and so reads as changed. A literal pin
in a fixture is the hash of the baseline's source, so a case can edit the source after review. A `self` or `gates` of
`@current` stands for the knowledge's own content hash, or its gate hash, in the case's tree, and is bound whether or
not any source pin is `@current`. A literal `self` or `gates` in a fixture is the value computed from the case's tree
when the case was written.

## 4. References and diagnostics

A body MUST NOT refer, by bare ID, to an artifact whose visibility the projection does not admit, other than the
requested product; nor link to, or write out the repository path of, an artifact not published in the same run. A
document refused here refuses, in turn, any document that links to it. A body MUST NOT contain, case-sensitively and
with any whitespace between words, the title (three or more words) of an artifact the projection does not admit,
unless a document published in the same run has the same title. A document refused for any reason, by this section
or because its Markset failed, allows no title, and the title and reference checks repeat over what is still
published until a round refuses nothing. For a document published as current, "a document published in the same run"
and the documents a link may reach are the documents published as current; for a document kept under review, they are
every document published in the run. A current document is therefore never published, or refused, because of a kept
one. No publication diagnostic may contain the title or path of an
artifact the projection does not admit; it names such an artifact by ID only.

| Code | Condition |
|---|---|
| CORE008 | A requested ID is not eligible, or a body refers to something its projection does not publish |
| PUB001 | The request is refused: a field missing, empty, of the wrong type or unknown, a list where one value is required, a value undeclared, authorization absent, or a snapshot whose graph hash is not the graph's |
| PUB002 | A body contains the title of an artifact outside the projection |
| PUB003 | The generated document is not valid Markset, or does not declare it |
| PUB004 | The generated document uses a `:::` directive outside Markset's vocabulary |

Every publication diagnostic has origin `publication` and severity error. An exclusion is reported, for counting, as
one of `not-requested`, `not-knowledge`, `draft`, `retired`, `planned`, `visibility`, `audience`, `availability-missing`,
`product`, `release`, `role`, `edition`, `flag`, `needs-review` (the first that applies, in that order), or, for an
eligible document refused later, `reference`, `title`, `directive`, `markset`. The index counts an exclusion only when the projection admits the excluded artifact's visibility, so a public
or customer index never reveals how many internal or restricted records exist; a refused request counts nothing.
Knowledge kept under review is published and is not counted as an exclusion. A kept document that this section
refuses is counted under its refusal reason. A CORE008 for requested knowledge excluded as `needs-review` SHOULD say
which condition of keepable failed (§3), or that the request did not name `keepUnderReview`.

`audience` applies when none of the request's audiences is in the knowledge's `audiences`, and `role` when none of
its roles is in `availability.roles`. A CORE008 for a requested ID excluded by either names only the request's
values, never the knowledge's.

The index a publisher writes for customer tools (Core §10) has five members, in this order: `profile`
(`intentset/publication-index/0.4`), `request`, `published`, `excludedCounts` and `keptUnderReview`. A reader MUST
refuse an index whose `profile` is any other value or that has a member this paragraph does not give it. `request`
records the request without its authorization: `visibility`, `audience`, `product`, `release`, `role`, `edition`,
`flags`, then `ids` when the request named them, then `keepUnderReview` only when it is `true`, in that order. `audience`, `role`, `flags` and `ids` are each a list sorted by code
unit without repeats. With its authorization added back it is a request, and publishing that request from the same
graph with the same `publishedAt` writes the same bytes in every file but the snapshot file. A product that caches
publications keys them on this request in canonical JSON, never on the request as its caller wrote it. `request` is
null for a refused request, which counts nothing. `published` lists the documents published as current, sorted.
`excludedCounts` maps each exclusion and refusal reason to its count, keys sorted, zero counts left out.
`keptUnderReview` lists the documents kept under review (§3), sorted, and is `[]` when there are none; each is at
`under-review/<ID>.md` (§2). Every record whose visibility the projection admits is counted once: in `published`, in
`keptUnderReview` or under one reason. An index reader that predates `keptUnderReview` refuses the index by its
members, and no kept document is ever listed in `published`.

## 5. The help file

Beside the documents, a publication writes `help.json`: every tip (Core §9) of every document published in the run,
keyed by the ID it explains, for a product's runtime to show beside the control that delivers that behavior. It is
one UTF-8 JSON object whose members appear in the table's order, with `knowledge` sorted by `id`, every member
keyed by ID sorted by key, the keys of `surfaces` sorted by code unit, and `withheldForReview` sorted without repeats. Every member in the table is always
present, a collection as `[]` or `{}` when it is empty, and `underReview` is present only where it applies. The file is written whenever the request is accepted, so a runtime can rely on it
being there, and the same bytes for the same inputs. It MUST NOT carry the snapshot it was published from (§6), so
its bytes change only when a tip, a tip's mark, a written surface, a published document, the request or `publishedAt` does.

| Field | Value |
|---|---|
| `profile` | `intentset/help/0.4` |
| `derived` | `true` |
| `projection` | the request's visibility |
| `audience` | the request's audiences, a list sorted by code unit without repeats |
| `availability` | `product`, `release` and `edition` from the request; `role`, the request's roles; and `flags`, the request's flags; each list sorted by code unit without repeats |
| `publishedAt` | the publication timestamp |
| `knowledge` | one entry per published document, current or kept under review, sorted by `id`: `id`, `title`, `path` (`<ID>.md`, or `under-review/<ID>.md` for a kept document), and `underReview: true` when the document is kept under review (§3) |
| `surfaces` | by surface ID (VSA §3), keys sorted: `knowledge`, the IDs of the documents published in the run that lead that surface, in the order its slice declares them; `{}` when no surface is written |
| `tips` | by explained ID, keys sorted: `text`, the tip as written; `knowledge`, the ID of the document it comes from; and `underReview: true` when that document is kept under review |
| `withheldForReview` | the rule IDs, sorted, whose tip was held back because its document is kept under review and that no current document tips; `[]` when none |

A tip is written exactly when its knowledge was published in the same run, so what gates a tip is what gates its
document: status, visibility, audience, availability and review. The key is the explained artifact's ID whatever that
artifact's visibility, because a product that binds a control to the ID has already written it where the same reader
can see it, and the file carries nothing else of that artifact: never its title, path, status or prose. A document
kept under review (§3) contributes its tips marked `underReview: true`, except a tip keyed to a rule, which is held
back: a rule's tip is the reason a product gives for a refusal, and a reason that may be wrong is worse than none.
When two published documents tip the same ID, a current document's tip is written in preference to one from a
document kept under review; among documents of the same kind, the tip from the knowledge with the lower ID is
written; which of the request's audiences or roles admitted each document makes no difference. A rule ID whose only
tips were held back is listed in `withheldForReview` and is not a key of `tips`. It is listed whatever its
visibility, for the reason a tip's key is. A retrieval system MUST NOT index the help file as
knowledge; its text is already in the documents it points at. The help file is not the
export: an export withholds a tip whose key is a withheld artifact's ID (export §3, ADR 0025), and the help file keys
its tips by explained ID whatever that artifact's visibility, because the projection that wrote it already admitted
the document the tip comes from.

A surface (VSA §3) is written only when all of these hold:

- its slice's status is one at which knowledge may be published (§1), and its slice's effective delivery (Core §7)
  is `built`;
- its slice declares `availability`, and the request passes it by the tests §1 applies to knowledge: the request's
  product, release and edition are each listed, at least one of the request's roles is listed, and every flag the
  slice names is in the request. A slice without `availability` writes no surface (Core §4);
- no other slice that is not retired declares the same surface ID (CORE013). A surface declared twice is written from
  neither slice;
- its slice is not `restricted`, or the request is authorized for restricted data (Core §9);
- the surface ID holds, word-bounded, no ID of an artifact whose visibility the projection does not admit, other than
  the requested product, and no repository path of an artifact not published in the run (§4's tests, applied to the
  key). A path counts wherever it stands as whole path segments, after a route's `/` too: a key holds
  `decisions/retry-policy.md` in `lantern-web:/decisions/retry-policy.md`, and not in `lantern-web:/old-decisions/retry-policy.md`;
- at least one knowledge record it lists has a document in this publication, a document kept under review (§3)
  included.

Its `knowledge` lists those records in declared order and leaves out every other. A surface whose knowledge was all
left out is absent, not empty, so a reader's file never names a surface it has no article for. The key is the
surface ID as declared, whatever the slice's visibility below `restricted`, because the product asking for a
surface's help already holds that ID (as for a tip's key; Core §9 states the exception). The slice's audiences add no
condition. The file carries nothing else of the slice: never its ID, title, path or status. An author MUST NOT put in
a surface ID a name that a reader of the slice's availability may not see; a review of a change SHOULD list every
surface ID added or changed on a slice past draft. `surfaces` is written whenever the file is, as `{}` when no surface
is written. The publication index counts nothing about surfaces. A generated document, its HTML and its retrieval
chunks MUST NOT carry surfaces. In a file made for several roles or audiences (§1), a surface may be admitted by one
of them only; such a file is served only to a reader who holds all of them.

A reader MUST refuse a help file, whole, when its `profile` is not `intentset/help/0.4`; when a member of the table
is missing, or the file or any object in it (an `availability`, a `knowledge` entry, a surface entry, a tip) has a member the table
does not give it; when `audience` or `availability.role` is not a non-empty list of strings in strictly ascending
code-unit order; when `availability.flags` is not a list of strings in that order; when `knowledge` is not strictly
ascending by `id`; when a `tips` key is not an ID; when a tip names knowledge the file does not list; when an
`underReview` is present with any value but `true`; when a tip carries `underReview` and the `knowledge` entry it names
does not, or the reverse; when a `knowledge` entry carries `underReview` and its `path` does not begin with
`under-review/`; when `withheldForReview` is not a list of IDs in strictly ascending order; when it shares an ID
with `tips`; when a `surfaces` key breaks VSA §3's rules, `__proto__` and digits-only included; or when a surface's
`knowledge` is empty, repeats an ID, or names an ID the file's `knowledge` does not list. A member added later to any object in the file therefore makes an older reader refuse the file rather than show too much,
and adding one moves this profile. A help file carries the entitlement it was published for. Like every file of its
publication, it MUST NOT be served to a reader who lacks any audience, role or flag it names, or whose clearance does
not include its `projection`, and that holds for every member in it, its surfaces and under-review marks included (§1).

A runtime that shows a tip, an article or a surface's lead marked `underReview` MUST show that it is under review,
and MAY leave it out. A coverage report MUST NOT count an ID in `withheldForReview` as a tip nobody wrote. A runtime
that shows a surface's articles lists them first, in the order given, before any article reached through the tips of
the controls on the surface, and lists each article once. It inserts a surface ID into markup or a selector only
escaped.

## 6. The snapshot file

A publication names the snapshot it was made from in one place: `snapshot.json`, beside the documents. It is one
UTF-8 JSON object, written whenever the request is accepted.

| Field | Value |
|---|---|
| `profile` | `intentset/snapshot/0.4` |
| `derived` | `true` |
| `commit` | the commit published from, or null when unavailable |
| `graphHash` | the hash of the graph published from |

Fields appear in this order. No other file of a publication may carry the commit or the graph hash: not a document,
its HTML or its chunks (§2), not the help file (§5), and not the index a publisher writes for customer tools
(Core §10). Both values move with every commit that changes a record, whatever that record is. With them in this file
alone, publishing the same knowledge for the same request and `publishedAt` at two commits writes the same bytes in
every other file.

The file carries nothing of the request, so every projection published from one snapshot writes the same bytes. A
request whose snapshot's graph hash is not the graph's is still refused (PUB001, §4), so the snapshot a publication
names is exact.

A publisher MUST offer a way to leave the file out, and the publication is then complete without it. A publication
that is committed to the repository it was published from SHOULD be written without it, or with the file ignored by
version control: the `commit` it names is the one checked out when it ran, which can never be the commit that
contains the output, and the file differs on every branch that changed a record, so two branches that each publish
conflict on it. A publication that is deployed or handed to another system SHOULD keep it; it is the only record of
which state of the model the documents were made from. A retrieval system MUST NOT index the snapshot file as
knowledge.
