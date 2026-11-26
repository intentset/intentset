# Consumers of the export: where each need is met

Driftline reads Intentset models through the export (`spec/export.md`). Streamlane does not: it reads the repository's
records at a commit through its GitHub App and the run records published as assets of the repository's
`evidence-records` release (Streamlane ADRs 0103 and 0104, which rejected reading the export), and writes the export
only as a producer. intentset.org's `/tools/readers/` says which reads by which path. This note maps what a reader of
the export needs to the field, report or fixture that supplies it, so implementation starts from the contract rather
than from this one's code. The rules a consumer follows are spec/export.md §5; what is below is
where to find things.

## Producing the export in CI

```sh
npm install --save-dev @intentset/cli   # only the CLI has the `intentset` binary
# after the tests, with a JSON reporter writing reports/vitest.json
npx intentset evidence import --from vitest reports/vitest.json --out .intentset/evidence/ci.json \
  --product <PRD-ID> --release <label>
npx intentset graph --level L3 --release <PRD-ID>:<label> --report all --out intentset-export.json
```

Upload `intentset-export.json` as a CI artifact; never commit it or the run records, which are stale at the next
commit. At L2 (no run records) `--report all` gives knowledge, impact and ownership; evidence is then not supplied,
which a consumer shows as such. The export states the repository's own verdict on evidence, by the binding it judges by, and carries that binding, each record's `binding` and `subjectHash` and each verification's `subject` (export §4.1), so a record made at an older commit reads current while the subject it checked is unchanged. A resource's files are in a subject only where the verification names the resource in `exercises` or an implementing slice owns it, so a backend change does not make stale every check of every web slice that talks to it, and EVID006 says how many verifications are current though a resource they use changed: add `exercises` where a check depends on one. A slice reached only through `dependsOn` puts every file it claims in a subject. That is the one rule since 0.3 (ADR 0026): `evidence.resources` and `evidence.dependencies` are unknown keys (CFG001). The export is unchanged by this. With pnpm and the CLI installed, the commands are `pnpm exec intentset …`. The
architecture check needs TypeScript 7: a repository on 5.x runs the CLI as
`npx -p @intentset/cli -p typescript@7 intentset …`, or with pnpm as
`pnpm dlx --package=@intentset/cli --package=typescript@7 intentset …`.

## Running only what moved

Under subject binding a record is current while what it checked is unchanged, so a merge makes stale only the
verifications around what it touched. A slow suite, such as a browser run on every merge, can run just those:

```sh
args=$(npx intentset evidence stale --format playwright --release <PRD-ID>:<label>)
[ -z "$args" ] || eval "npx playwright test $args"
```

`--format playwright` prints `--grep '<selectors>'` and the locator files, so only those spec files load and only the
tests carrying a stale verification's selector run; `--format vitest` prints the files and `-t '<selectors>'`, and
`--format node-test` one `--test-name-pattern` per selector and the files. Import the run afterwards as usual and the
records are current again. The runner matches a pattern as a substring where Intentset matches the selector as a whole
token, so a few extra tests may run, never fewer. When nothing needs a run the command prints an empty line and says so
on stderr, so the capture is safe; guard it as above, because a runner given no arguments runs everything, or let the
nightly run be the full one. The arguments are quoted for a POSIX shell, so paste them or pass them through `eval`, as
above; an unquoted `$args` would hand the runner the quote characters. `--check` exits 1 while any automated verification needs a run, for a gate that asks
whether the evidence is current; `--format json` is the list for a script. A manual review is listed apart, because no
runner re-runs it. A change to a central slice moves nearly everything, and that merge needs the full suite; the
nightly run is the backstop for what the declarations missed (ADR 0013).

## Reading it

`readExport(text, { repository, product })` from `@intentset/core` (no dependencies) returns the envelope and the
reports supplied, or a rejection category. A consumer in another language makes the same checks; either way, run the
importer over `@intentset/conformance-suite/consumer/` (or `tests/consumer/` here) in the consumer's own tests.

## Streamlane

The table is what Streamlane was to need from the export before its ADR 0104 chose to read the repository instead; it
is kept for the export's fields, and no Streamlane code reads an export.

| Requirement | Met by |
|---|---|
| STL-001 connection with stable identity | `repository`, `products`; `identity-mismatch` cases |
| STL-002 versioned import, validate before promotion | `contract`, `readExport`; `unsupported-contract`, `malformed`, `not-json` cases; snapshot pair (`source.commit`, `graphHash`) for idempotent re-import (`full-regenerated.json`) |
| STL-003 link to stable artifact IDs | `artifacts[].id`, `type`, `status`, `visibility`; key by (connection, ID), never title or `path` |
| STL-004 traceability with provenance | owning slice: `derived.implements` on a behavior; rules: `links.governedBy`; checks: `derived.verifies`; run status and freshness: `reports.evidence.verifications[].status`, `binding` and `latest`, and `reports.evidence.binding` and `bindingReason`; per-claim: `reports.evidence.claims`; knowledge: `derived.explains` and `reports.knowledge` |
| STL-005 impact as review context | `reports.impact.starts[]`: `direct` apart from `candidates`, each step's `reason`, and `note` |
| STL-006 work state apart from product state | nothing flows back; the export is read-only by contract |
| STL-007 moves, retirement, stale snapshots | IDs survive path changes; `status: retired` with `links.replacedBy`; dangling links stay visible (§2) |
| STL-008 authorization before retrieval | restricted artifacts withheld by default (`withholding`), but per-reader authorization stays Streamlane's (§3, §5) |
| STL-009 refresh and stale states | rejection keeps the prior snapshot; `stale-evidence.json` for evidence; "not supplied" for absent reports (`minimal.json`) |
| STL-010 optional | nothing in the export assumes a connection exists |

Streamlane's own work: the read-model ADR (one table per record kind), Connection, Snapshot, artifact read model and
Import audit records, atomic promotion, work-item associations, the Product context panel, and per-reader
authorization.

## Driftline

| Need | Met by |
|---|---|
| Behaviors, their availability and flags | `artifacts[]` of type `behavior` with `availability` (products, releases, roles, editions, flags); `registries.flags` |
| A stack frame's file to a slice, its behaviors and its team | `reports.ownership.files[]` (`path` to `region` and `owner`), then the slice's `links.implements` and `owner` |
| Affected behaviors for an incident | the owning slice's `links.implements`, then `reports.impact` from each behavior for what depends on it |
| Outcomes and their measures | `artifacts[]` of type `outcome`, and of type `measure` with `parent` naming the outcome and `measure` carrying metric, baseline, target, window and source; `registries.evidenceSources` names where readings come from |
| Beta explanations | knowledge artifacts and `reports.knowledge` (only `current` knowledge is fit to show users) |
| Its own model, written before its code | VSA §3: draft slices plan their paths as warnings, so L2 holds from the first commit |

Driftline's usage-evidence specification, keyed to Intentset IDs, is planned as an Intentset extension and is not
part of 0.7; Core §8 names the shape an outcome evidence record will take (measure ID, window, observed value, source,
time, URI, target met). Until it exists, Driftline-specific fields go in namespaced `extensions`, which the export carries as
authored.

## Moving a pin: export 0.7 and specifications 0.3 (in progress)

The next release moves `intentset.spec` from `0.2` to `0.3` and the export from 0.6 to 0.7: `spec` in the envelope is
`0.3`, and each artifact's `profile` is `intentset/<type>/0.3`. Three rules have changed so far. ADR 0026 computes a
subject one way, so `evidence.resources` and `evidence.dependencies` are gone from the configuration and either key is
CFG001; the export's shape is unchanged by it. ADR 0023 makes `status` the review lifecycle only, `draft`, `approved`,
`deprecated` or `retired`: `implemented` and `released` are CORE001, the export's status enum loses them, and the
effective delivery is the field, else `built` for `deprecated`, else not stated. ADR 0025 makes a knowledge record's
review the core field `review`, whose pins are content hashes unless `hash` says `file-v1`; each knowledge artifact
carries it, and the export withholds a pin, and a tip, with the artifact it names. ADR 0024 gives each kind of thing
to fix a code of its own: a carrier that cannot be read (no frontmatter, YAML the strict subset rejects, a repeated
key, a file over the size limit) is CORE010, a missing level-one heading or required section is CORE011, and a record
past draft that lacks a relationship it must have, the error form of the CORE009 warning, is CORE012; CORE001 keeps
every field's shape and CORE003 every link that does not resolve. The diagnostic's shape and the export's are
unchanged. ADR 0029 lets a publication request name every audience and role of one reader, and leaves the export as
it was: no publication data is in it.

| Where | What changes |
|---|---|
| The repository that produces the export | First delete `evidence.resources` and `evidence.dependencies` from `.intentset/config.yaml` if it sets either: while either key is present, at any value, the old defaults `exercised` and `files` included, `intentset migrate` and every other command stop with CFG001 and rewrite nothing. Then move `@intentset/cli` to that release, run `intentset migrate --to 0.3` on a clean tree and commit the result: it rewrites `spec` and `profile` in every record, from `0.2` or `0.1`, and a `status` of `implemented` or `released` to `approved`, writing `delivery: built` beside it on a capability, behavior, rule, scenario, slice or contract that states no `delivery`, and moves each knowledge record's `extensions.intentset.org/review` to `review`, writing `hash: file-v1` where it named no hash, so no review changes what it pins. The move rewrites `spec` and `profile` in every record, which both pin kinds cover, so it also re-pins each knowledge review pin that matched its source before the move to the same kind of hash of the source as moved: a review current before the move is current after it, with nothing to do by hand, and a stale one stays stale. Do not re-pin by hand. A review that was stale before the move is renewed by its reviewer, against the sources as they are, with `intentset approve <KB-…> --renew-review --by <name>`, which writes content-v1 pins, the knowledge's own text in `self` and its sources' gates in `gates` (ADR 0027), and leaves `status` and `approval` alone. A 0.3 reader rejects a record still at an earlier version and names the command. A repository that kept the defaults keeps every subject hash, so a current pass stays current. One that set `resources: used` or `dependencies: entrypoint` now gets the one rule (ADR 0026), so a subject can gain or lose files, and a record can turn current or stale until its check runs again. |
| A reader of the export | Support `intentset/export/0.7` and drop 0.6, which a 0.7 reader rejects as `unsupported-contract`. Expect `spec` `0.3` and profiles ending in `/0.3`. A `status` is `draft`, `approved`, `deprecated` or `retired`; compute the effective delivery as `delivery` when it is not null, otherwise `built` for `deprecated`, otherwise not stated (`deliveryOf` does), and never read `approved` as built. Accept `review` on every artifact, null except on reviewed knowledge, with `sources`, `hash` (null means `content-v1`) and `snapshot`; a pin or a tip keyed by a withheld artifact is left out and counted in `withheldLinks`, so take whether knowledge is current from `reports.knowledge`, never from the pins. A review's `self` and `gates` are never exported; each `reports.knowledge` entry says in `self` (`unchanged`, `changed` or `unpinned`) whether the knowledge's own text still matches its review, and an entry `current` with a `changed` self is `inconsistent-report`. |
| A gate or a report that filters on codes | An adopter's gate that names CORE001 or CORE003 to mean "any of these" must name the new codes too: CORE010 and CORE011 beside CORE001, CORE012 beside CORE003. A filter on severity or on `hasErrors` needs no change. |
| A reader of a publication (`help.json`, a document's `intentset-publication` block, `index.json`, and the header of every result `@intentset/mcp`'s customer tools return) | `audience`, `availability.role` and `availability.flags` are sorted lists of the request's values, even for one value, and a block's `flags` names every flag the request held, not only those its knowledge requires. They are held all-of: serve a file only to a reader who holds every value it names (`@intentset/help`'s `servedTo`). `help.json` is closed, every member of publication §5's table present, and a reader refuses any other member. The index is `{ profile: "intentset/publication-index/0.3", request, published, excludedCounts, keptUnderReview }` in that order, and a reader refuses another profile or member; its `request` lists `audience`, `role`, `flags` and `ids` sorted, then `keepUnderReview` only when it is `true`, so a cache keys on it in canonical JSON. Every record whose visibility the projection admits is counted once, in `published`, in `keptUnderReview` or under one reason in `excludedCounts`. A publication made with `keepUnderReview` (ADR 0027) writes documents kept under review under `under-review/`, each block carrying `underReview: true` and `changedSinceReview`; `published` and `PublishResult.documents` hold current documents only. Never chunk, index or serve as current a document whose block carries `underReview`; a runtime that shows one, or a tip marked `underReview` in `help.json`, shows that it is under review, and a coverage report counts an ID in `withheldForReview` as written. |
| A consumer's own tests | Run the importer over the fixtures again: every envelope names 0.7 and spec `0.3`, and `unsupported-contract-0.6.json` is new. |

## Moving a pin: export 0.6 (ADR 0020)

0.16.0 adds two members to every artifact: `approval`, the basis the record states for its approval
or null, and `formalizes`, the outside requirements it names or an empty list. Nothing else in the envelope changed,
and the specifications stay 0.2.

| Where | What changes |
|---|---|
| The repository that produces the export | Move `@intentset/cli` to that release. No record needs rewriting: both fields are optional. Move the tools before any record carries either field, because an earlier release rejects both as unknown keys. |
| A reader of the export | Support `intentset/export/0.6` and drop 0.5, which a 0.6 reader rejects as `unsupported-contract`. Accept `approval` and `formalizes` on each artifact (export §2). A null `approval` means the record does not say how it was approved, never that it is unapproved; `basis` is `direct`, `derived` or `attested`, and `by`, `source` and `attestedBy` are null where the basis does not carry them. Neither `approval.source.ref` nor a `formalizes` entry was resolved by the producer. Whether a basis is acceptable is the reader's workflow: the export states it and decides nothing. |
| A tool that writes approvals | Write `approval` when it approves a record (Core §7): `basis: derived` with the approved item's `ref` and its `revision` or `digest`, `by` naming the person who approved the item, and `attestedBy` naming the agent that matched the record to it. The content hash leaves `approval` and `formalizes` out, so writing them moves no `content-v1` review pin; the file's `sourceHash` moves as for any edit, so the graph hash moves and a subject-bound run record of a verification of that record reads stale until it runs again, as it does when a status changes. |
| A consumer's own tests | Run the importer over the fixtures again: every envelope names 0.6, each carries one derived approval and one formalized requirement, and `unsupported-contract-0.5.json` is new. |

## Moving a pin: export 0.5 (ADR 0017)

0.12.0 adds `delivery` to every artifact: `planned`, `built` or null, as the record wrote it. Nothing else in the
envelope changed, and the specifications stay 0.2.

| Where | What changes |
|---|---|
| The repository that produces the export | Move `@intentset/cli` to 0.12.0. No record needs rewriting: `delivery` is optional. |
| A reader of the export | Support `intentset/export/0.5` and drop 0.4, which a 0.5 reader rejects as `unsupported-contract`. Accept `delivery` on each artifact. To show whether work is built, read the effective delivery (Core §7): `delivery` when it is not null, otherwise `built` for a status of `implemented`, `released` or `deprecated`, otherwise not stated; `deliveryOf` in `@intentset/core` computes it. Never read `approved` as built. |
| A consumer's own tests | Run the importer over the fixtures again: every envelope names 0.5, and `unsupported-contract-0.4.json` is new. |

## Moving a pin: export 0.4 and specifications 0.2 (ADR 0014)

Both are breaking, they ship together as 0.7.0, and a consumer moves both pins at once.

| Where | What changes |
|---|---|
| The repository that produces the export (Streamlane's `model:export`, Intentset's own) | Move `@intentset/cli` to 0.7.0, and run `intentset migrate --to 0.2` once on a clean tree, committing what it rewrites: it changes `spec` and `profile` in each record the scope matches and nothing else. A 0.7.0 reader rejects a record that declares `0.1` (CORE001). |
| A reader of the export (`readExport`, Driftline's `modelFromExport`) | Support `intentset/export/0.4` and drop 0.3, which a 0.4 reader rejects as `unsupported-contract`. Accept `reports.evidence.binding`, `bindingReason`, each verification's `binding` and `subject`, a run record's optional `binding` and `subjectHash`, and a verification artifact's `exercises`; take a status as the producer's verdict under that binding (export §4.1) and show the binding beside it. |
| A consumer's own tests | Run the importer over the fixtures again: `subject-current.json`, `subject-stale.json`, `commit-fallback.json`, `subject-hash-mismatch.json` and `unsupported-contract-0.3.json` are new, and every accepted envelope's `spec` is `0.2`. |

A record imported by commit binding stays what it was; under the default a repository with slices reads such a record as
stale until `intentset evidence import` writes it again (Core §8). What changes for a reader of the export is that
evidence the repository's gate accepts now reads current there too.
