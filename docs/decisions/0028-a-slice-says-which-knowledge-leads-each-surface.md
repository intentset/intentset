# ADR 0028: A slice says which knowledge leads each surface of a product

**Status:** accepted, 2026-11-25 (issue #143). Part of the move to `0.3`, with ADR 0023 to ADR 0026, ADR 0027
(issue #142) and ADR 0029 (issue #144). Builds on [ADR 0011](0011-tips-on-knowledge-and-the-help-file.md) and amends
nothing. Codes allocated in this release: CORE010 to CORE012 (ADR 0024) and CORE013 (this ADR). ADR 0027 and ADR 0029
add none. The maintainer decided on 2026-11-25 that surfaces are written only from approved or deprecated slices
that are built, and that an internal slice's surface ID may reach a customer help file as an explained ID may be a
tip's key, while a restricted slice's needs `authorizedRestricted`.

## Context

`helpForPage(help, ids)` in `@intentset/help` orders a page's articles by the behavior IDs on its controls. A page also
needs the articles about the page itself, shown first. The model has nowhere to say which those are: Intentset has no
concept of a page, and no field says which knowledge leads where.

An adopter keeps this in an extension on its slice records. Its routes and item types each name their lead articles,
it generates a second file beside `help.json`, and it checks that file with a coverage script of its own. Its decision
record names a surface concept in the publication profile as the cleaner home for this. The need grows when one screen
is shown in more than one place, such as a module federated into several host applications. The host's URL cannot name
the page there, so the key has to be one the product chooses, such as the exposed module and its internal route.

The issue proposes a slice field, a check, a help-file member and an option on `helpForPage`. Several parts of it need
changing before it can ship.

1. **`[]` for a surface whose articles were all left out fails open.** Every declared surface key would be written
   into every reader's help file, admin and other-edition routes included. The file would tell a reader that a surface
   exists when that reader has no help for it (design invariant 4).
2. **A key is text in a reader's file, so something has to admit it.** A tip's key is an explained ID, and the tip
   reaches the file through a reviewed knowledge record. A surface key is written on a slice. Two gates are needed: the
   slice's own status, delivery and availability, and a point where a reviewer sees the key text. A slice that has no
   `availability` must not pass that test silently. Core §4 says missing access information fails closed.
3. **A key passes through a parser and a serializer.** Core's YAML reader assigns each mapping key into a plain object
   (`yaml.ts`, `result[key] = value`). A `__proto__` key therefore sets the object's prototype, and the surface vanishes
   with no diagnostic. JavaScript also writes integer-like keys (`9`, `10`) first, in numeric order, whatever order they
   were inserted in. A help file that says "keys sorted" would then hold different bytes from a second implementation
   that sorts by code point.
4. **The codes.** ADR 0024 keeps CORE003 for references that do not resolve, have the wrong type, point at the record
   itself or repeat. A retired target is a lifecycle inconsistency, CORE005. CORE002 means a duplicate artifact ID whose
   records are set aside, so a surface declared twice needs a code of its own.
5. **A later member must not fail open.** The issue's planned `feature` field hides articles. A reader that ignored an
   unknown member of a surface entry would show what that field hides, so the entry has to be closed.
6. **Three ADRs change `help.json` in this release.** ADR 0027 marks documents kept under review, and ADR 0029 turns
   `audience` and `role` into lists. A surface has to say what happens to a kept document and to a request for several
   roles.

## Decision

**A slice MAY declare `surfaces`: a map from a surface ID the product chooses to the knowledge that leads that surface,
in order. The help file maps each surface to the articles published for its reader. A surface is written only from a
slice that is approved or deprecated, built, available to the request, and not restricted unless the request is
authorized for restricted data; only when its key names nothing the reader may not see; and only when at least one of
its articles was published in the run. Every other surface is left out of the file.**

```yaml
intentset:
  type: slice
  status: approved
  delivery: built
  availability:
    products: [PRD-LANTERN]
    releases: [pilot-1]
    roles: [teacher]
    editions: [standard]
    flags: []
  slice:
    kind: product
    # ...
    surfaces:
      "lantern-web:/assessments/schedule":
        knowledge: [KB-ASMT-SCHEDULE, KB-ASMT-CLASSES]
      '@lantern/assessments#/review':
        knowledge: [KB-ASMT-REVIEW]
```

### The field

- **Where it lives.** On the slice, under `slice`, defined in VSA §3. Changing which article leads a surface changes
  the slice and never sends reviewed knowledge back to review. Review pins name explained sources, which are behaviors,
  rules and capabilities (ADR 0025), and ADR 0027's `self` pins the knowledge record itself. No pin ever names a slice.
- **What a surface is.** A place in the product's interface where a reader is shown help: a page, a route, a panel,
  or a module wherever it is mounted. It is not what `entrypoints` declares. VSA calls that a *public contract surface*
  everywhere after this change, and every bare "surface" that means an entrypoint is reworded (spec edits below). The
  name `surfaces` is kept. The issue, the adopter's decision and the help file all use it, and the alternative,
  `screens`, already names VSA §6's composition rule.
- **The key.** 1 to 200 characters from printable ASCII, leaving out the six characters that end or escape an HTML
  attribute, a CSS selector or a JSON string: `"`, `'`, `<`, `>`, `\` and the backtick. The pattern is
  `^[!#-&(-;=?-\[\]-_a-~]{1,200}$`, written with character ranges and no lookahead so every regular-expression engine
  reads it the same way. Two further rules apply. The key MUST NOT consist of digits only (`^[0-9]+$`), because
  JavaScript, and so any writer built on it, orders integer-like keys first. The key MUST NOT be `__proto__`. Keys
  are compared exactly, and Intentset treats a key as opaque and never resolves it to a file or a URL. A leading `@`
  is allowed, so a scoped module name fits (`@org/app#/route`). `:`, `/`, `[`, `]`, `{` and `}` are allowed, so route
  templates in common forms fit (`/students/:id`, `/students/[id]`, `/students/{id}`).
- **The entry.** Exactly one member, `knowledge`: a non-empty list of unique IDs in the order a reader is shown them.
  The name is the same in the slice, the export and the help file, as a tip entry's `knowledge` is. A malformed
  `surfaces`, an entry with any other member, an empty list, a repeated ID, or a key that breaks the key rules is
  CORE001. A repeat follows `verification.exercises`, the nearest list that is not a link. A key repeated within one
  slice is a duplicate YAML key, which is CORE010 (ADR 0024).
- **Availability is required.** A slice that declares at least one surface MUST declare `availability` (CORE001). A
  slice with no surfaces, or with `surfaces: {}`, is not affected. Publication also fails closed on a missing block,
  for the library caller that publishes from a graph that did not validate.
- **`__proto__` anywhere.** Core §3 adds the mapping key `__proto__` to the YAML forms a reader refuses, which makes it
  CORE010 in any mapping: surfaces, tips, extensions and unknown top-level keys. Today such a key is dropped silently
  everywhere, against design invariant 6. No existing case uses it. The key rules still name `__proto__` for readers of
  JSON (`readHelp`, `readExport`), which keep it as an own property.

### Checks

- An ID in `knowledge` that does not resolve, or that names something other than knowledge, is CORE003.
- A slice that is not retired and names retired knowledge is CORE005, an error. Its remediation names the successor
  that the knowledge's `replacedBy` gives. CORE005 then has three conditions: the two ADR 0023 keeps, and this one.
- Draft knowledge MAY lead a surface. It appears once it is published.
- A surface ID declared by two or more slices that are not retired is **CORE013**, an error, reported on each slice at
  `/intentset/slice/surfaces/<key as a JSON pointer token>`. Draft slices count. A draft successor declaring a surface
  that an approved slice still declares makes two authorities for one key, and neither validation nor publication
  picks one. A team replacing a slice moves the surfaces in the commit that retires the old slice. A retired slice's
  surfaces are history.
- **Not a relationship.** `surfaces` adds no edge to `links`, and nothing derives an inverse from it (design invariant
  2).
- **Not a binding field.** `surfaces` is not one of a slice's binding fields (Core §8), so changing it moves no
  subject hash and no subject-bound evidence. Under commit binding, any record edit changes the graph hash, as it does
  today (design invariant 3). The slice's content hash, source hash and the graph hash do move, because `surfaces` is
  part of the record. That is harmless, because no pin names a slice, so content-v1 keeps its one definition.

### The help file

`help.json` (profile `intentset/help/0.3`) gains `surfaces` between `knowledge` and `tips`. It is required, and `{}`
when no surface is written. A 0.3 reader refuses every other help profile (5bf83c3), so no 0.3 file exists without the
member, and readers have one shape to handle. Keys are in ascending UTF-16 code-unit order (`compareStrings`); every
surface ID is ASCII, so this is also code-point order. That order is stable under `JSON.stringify` because no key is
integer-like.

A surface is written only when all of these hold:

1. its slice's status is one at which knowledge may be published: `approved` or `deprecated`, the publisher's
   `PUBLISHABLE_STATUSES` after ADR 0023. This is an allow-list, so a status added later is not admitted by default;
2. its slice's effective delivery (Core §7) is `built`. An approved slice that does not state `delivery` writes no
   surface;
3. its slice declares `availability`, and the request passes it on every dimension by the test knowledge passes:
   the product, the release and the edition each listed, at least one of the request's roles listed (ADR 0029), and
   every flag the slice requires named in the request. A slice without `availability` writes no surface;
4. no other slice that is not retired declares the same surface ID. This is CORE013's condition exactly, so a surface
   declared twice is written from neither slice, never tie-broken. This matters because the library `publish()`
   publishes from graphs that did not validate; only the CLI refuses them;
5. its slice is not `restricted`, or the request carries `authorizedRestricted`. Core §9 says internal and restricted
   data require separate explicit authorization. An `internal` slice's key is admitted without it, under a stated
   exception that mirrors ADR 0011's for a tip's key: the key is a name the product's interface already holds, not the
   slice's content, and nothing else of the slice is written;
6. its key names nothing the reader may not see, by publication §4's tests: it holds, word-bounded, no ID of an
   artifact whose visibility the projection does not admit (other than the requested product), and it holds no
   repository path of an artifact not published in the run. A key such as `lantern-web:/SCN-ASMT-SCHEDULE` in a
   customer projection is not written;
7. at least one of its knowledge has a document in this publication. A document ADR 0027 keeps under review counts:
   it is written in the run, and its mark is on its `knowledge` entry.

The entry's `knowledge` lists those documents in declared order and no other ID. A surface whose knowledge was all
left out is absent, not empty. The key is written whatever the slice's visibility below `restricted`, for the reason
ADR 0011 gives for a tip's key: the product that asks for a surface's help already holds that ID where the same reader
sees it. The slice's `audiences` add no condition. Its availability, its status, its delivery, its restriction, the key
test and a published lead bound who receives the key, and `intentset review` shows every key change on a slice past
draft to a reviewer (below). The file carries nothing else of the slice: not its ID, title, path or status. Generated
documents, their HTML and their retrieval chunks never carry surfaces.

A file made for several roles or audiences (ADR 0029) may hold a surface that only one of those roles admits. ADR
0029's serving rule covers it like everything else in that file: serve the file only to a reader who holds every role
and audience it names.

### The reader

- `readHelp` requires `surfaces` in a help/0.3 file. It refuses the whole file when `surfaces` is not an object, when
  a key breaks the key rules, when an entry has any member besides `knowledge`, or when `knowledge` is empty, repeats
  an ID, or names an ID that the file's `knowledge` does not list. A member added to a surface entry later therefore
  makes an old reader refuse the file rather than show too much, and adding one moves the help profile.
- `leadFor(help, surface, options?: ReviewOptions)` returns the surface's `HelpKnowledge` entries in order. It looks
  up the key with `Object.hasOwn` and returns `[]` for a surface the file does not list. `surfaceHelp(help, surface,
  options?)` returns `{ lead, pendingReview }`, so a caller can tell a surface whose leads are all under review from
  one the file does not list; `leadFor` alone cannot, and the README says a coverage report never uses it alone.
- `helpForPage(help, ids, options?)` takes `PageOptions`, which ADR 0027 defines as `ReviewOptions` and this ADR
  extends with `surface?: string`. The result is `PageHelp { surface, lead, knowledge, tips, missing, pendingReview,
  leadPendingReview }`, in which:
  - `surface` is the surface as given, or null;
  - `lead` is `leadFor`'s result;
  - `knowledge` is `lead`, followed by the articles that tips reach and that are not already in `lead`, sorted by ID;
  - `tips`, `missing` and `pendingReview` are as ADR 0027 and today define them. `pendingReview` holds control IDs, as
    `missing` does, and never a lead's knowledge ID;
  - `leadPendingReview` holds the knowledge IDs of leads under review, in declared order.

  Without options the result is today's, plus `surface: null`, `lead: []` and `leadPendingReview: []`, plus ADR 0027's
  `pendingReview`.
- **Under review.** A kept document's entry carries `underReview: true` (ADR 0027). Under the default
  `underReviewHelp: "exclude"`, `leadFor`, `surfaceHelp` and `helpForPage` drop the entry from `lead` and `knowledge`
  and list its ID in `leadPendingReview` (or `surfaceHelp`'s `pendingReview`); a surface whose leads are all under
  review then has an empty `lead`. Under `"include"`, a lead keeps that mark, is still listed there, and a runtime MUST
  show it is under review.

### Writers and the export

- Core's slice reader, the export and the publisher build each surface map in sorted key order into a plain object.
  No `__proto__` key reaches them, because every reader refuses it, so assigning into a plain object is safe. Null
  prototypes are not used: `assert.deepStrictEqual` treats them as unequal to `{}`, and a product calling
  `hasOwnProperty` on them would throw. `sortKeysDeep` in `hash.ts` defines each key as an own property, so a hashed
  value never loses one.
- **The export (0.7).** Each slice carries `surfaces`, `{}` when it declares none, with keys in code-unit order. Each
  list stays in declared order, less withheld IDs, which `withheldLinks` counts. A surface whose every ID was withheld
  keeps its key with an empty list. The withholding filter keeps order: it is not the export's sorting `keep()` helper.

### The operator and the reviewer

- `intentset publish` prints, after the files it wrote and into none of them, one line for each declaring slice whose
  visibility the projection admits and whose surfaces were left out, by ID only, with the reason: `draft`, `retired`,
  `not-built`, `availability-missing`, `unavailable`, `restricted`, `reference`, `declared-twice` or
  `nothing-published`. A slice the projection does not admit is neither named nor counted. This is the rule the
  publication index applies to exclusions, which counts only what the projection admits (`publish.ts`: a customer
  index that counted internal records would say how many exist), and it keeps a public run's CI log from disclosing
  how many internal slices declare surfaces (design invariants 4 and 6). The publication index counts nothing about
  surfaces.
- `intentset review --base <ref>` gains a section, "Surfaces changed". It lists each slice past draft at the head
  whose surface keys were added or removed, or whose lists changed, against the base. Base copies are read through
  `readBaseCopy`, so migrating a base copy adds no line. It fails nothing. It is where a reviewer sees key text
  before that text reaches a reader's file. Approval in this repository pins nothing (ADR 0022), so an approved slice
  can be edited later, and this listing is the gate for that edit.
- The agent guide says which field carries a page's lead articles. It also says that a surface ID is written into
  every eligible reader's help file once its slice is approved, so a key must never hold a name some reader of the
  product may not see.

## Rejected

- **Declare leads on the knowledge.** Every reorder would edit a reviewed record and send it back to review, and the
  order of a surface would be a sort across records rather than one authored list.
- **A `links` kind.** A surface map is ordered and keyed, and no check needs its inverse. Links are sorted, and here
  the order is the meaning.
- **`[]` for a surface whose articles were all left out.** It lists every surface to every reader.
- **A slice without `availability` adds no condition** (the earlier draft). It fails open in a repository with more
  than one product: another product's internal route would reach a customer file through a shared article. Core §4
  says missing access information fails closed.
- **Gate on the slice's visibility as knowledge is gated.** It would keep surfaces out of every customer file unless
  slices are made customer-visible, which slices almost never are. An internal slice's key is admitted under a stated
  Core §9 exception, bounded by availability, status, delivery, the key test, a published lead and the review listing.
  A restricted slice needs `authorizedRestricted`, as restricted data does everywhere else.
- **Admit a key on its pattern alone.** `BEH-ASMT-INTERNAL` or a record's repository path matches the key pattern,
  and would reach a customer file from a slice whose lead is a customer article. The key gets §4's bare-ID and path
  test.
- **Count the slices whose omission the projection may not see** ("and N more"). A count in a public run's log says
  how many internal slices declare surfaces, which the index's own counting rule refuses to say.
- **Warn when a lead explains nothing the slice implements.** An overview article legitimately leads a page whose
  behaviors it does not explain, such as a getting-started guide on a dashboard. The leak this warning was meant to
  close, an unrelated slice's key reaching readers through a widely published article, is closed by requiring and
  testing the slice's availability.
- **The lower slice ID wins a surface declared twice.** It picks an authority the model never chose.
- **CORE013 only among slices past draft, or a warning between a draft and an approved slice.** The first leaves two
  authorities for one key, and the second gives one code two severities. Moving the surfaces in the retiring commit
  costs one edit.
- **Widen CORE002 for a duplicate surface ID**, or **report a retired lead as a CORE005 warning.** Both break ADR
  0024's rule that one code names one thing to fix.
- **A repeated ID as CORE003 through the link path.** `surfaces` is not a link, and `exercises` reports a repeat as
  CORE001.
- **Ignore unknown members of a surface entry.** It fails open for the planned `feature` field.
- **Allow digit-only keys and specify JavaScript's object order instead.** Every other implementation would then
  have to reproduce that order. Routes and module specifiers are never bare numbers.
- **Carry `surfaces` as an array of `{surface, knowledge}`.** It solves ordering at the cost of a lookup structure
  readers have to build. It also breaks the parallel with `tips`, which is a keyed object.
- **All printable ASCII, or a Unicode key.** Printable ASCII admits markup and selector metacharacters into strings
  that runtimes put into HTML and attribute selectors. Unicode raises NFC/NFD questions that exact comparison cannot
  settle, and a key with spaces can carry a title that publication §4 protects. A non-ASCII route is written
  percent-encoded.
- **An RFC 3986 grammar with a first-character rule.** It refuses scoped module names, the case the issue was raised
  for.
- **Null-prototype objects for surface maps.** Once every reader refuses `__proto__` they protect nothing, and they
  break `deepStrictEqual` and `hasOwnProperty`.
- **Leave `surfaces` out of content-v1.** No pin names a slice, so an exception would only lengthen the definition.
- **`surfaces` optional in a help/0.3 file.** A 0.3 reader accepts no other profile, so the optional form describes
  files that cannot exist.
- **An empty authored list**, **`help` in the slice and `knowledge` in the file**, **a separate `pages.json`**, and
  **leaving it to adopters' extensions**: these are as the first draft argued.

## Consequences

- Records are additive: `slice.surfaces` is optional, and no existing case changes its `valid`, `diagnostics` or
  `published`. The new checks bring cases of their own. The `__proto__` refusal turns a silent drop into CORE010. No
  case holds such a key, and the change rides the move to `0.3`.
- The export moves inside `0.7`, which ADR 0023 and ADR 0025 already move: the closed `slice` gains a required
  `surfaces`. The consumer fixtures are regenerated. Landing after `0.7` ships would need `0.8`.
- The help file gains a required member in `intentset/help/0.3`. Every help file's bytes change in this release.
  ADR 0029's lists already change them, so ADR 0027's "byte for byte" claim reads "identical to a 0.3 publication
  without `keepUnderReview`".
- `@intentset/help` copies the key rules rather than importing core (design invariant 8), and a test holds its
  patterns' sources equal to core's.
- Core gains CORE013, and CLAUDE.md's code range becomes `CORE001`–`CORE013`.
- A surface reaches a product only from an approved or deprecated slice that says `delivery: built` and declares
  `availability`. An adopter that keeps slices in draft, as the worked example does, gets no surfaces until a person
  approves the slice. The CLI's omission line says why.
- `intentset review` shows key changes to a reviewer. An agent that adds a surface to an approved slice is visible in
  the pull request, as an agent that edits an approval is.
- Follow-ups, not in this change: help-file consumer fixtures in the suite, so a reader in another language is checked
  as export readers are; surfaces on the Atlas slice page and in `intentset context`, escaped as text; the `feature`
  field, which moves the help profile; and the integer-like-key ordering question for other author-keyed maps
  (`layers`, `extensions`), which canonical JSON hashes and which no case exercises yet.
