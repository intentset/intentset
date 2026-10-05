---
title: Intentset Export Contract v0.3
id: intentset/export/0.3
status: draft
revision: 2026-10-05
implementation: 0.6.0
---

# Intentset Export Contract v0.3

**Extends:** [Core §12](core-0.1.md#12-portability-and-exclusions) • **Schema:** [export.schema.json](export.schema.json)

The export is how a tool outside the repository reads a product model: a work tracker linking work items to
behaviors, a usage product attributing errors to slices, a second implementation comparing graphs. This document fixes
the envelope a producer writes, the optional reports it may carry, what is withheld from it, and what a consumer MUST
check before it lets an envelope replace the snapshot it holds. MUST, MUST NOT, SHOULD and MAY are used as in Core §1.

The producer owns product semantics and the status of evidence and knowledge; a consumer displays them without
reinterpreting them. Nothing in an export flows back: a consumer never sets a lifecycle, records evidence or approves
knowledge by writing to it.

## 1. The envelope

An export is one UTF-8 JSON object. Its lists are sorted (artifacts by `id`, report entries by their ID or path, ID
lists by code point) except where order is the meaning: an impact entry's `ancestors` run from parent to root, and a
hit's `path` from the start. The same validation with the same `generatedAt` is the same bytes.

| Field | Meaning |
|---|---|
| `contract` | `intentset/export/0.3`. A consumer MUST reject any other value (§5). |
| `spec` | The Core version the model is written against: `0.1`. |
| `generatedAt` | ISO 8601 time of generation. Outside every hash; two exports of one snapshot differ only here. |
| `repository` | The stable repository identity from `.intentset/config.yaml`. |
| `products` | The exported product artifact IDs. |
| `source` | `commit` (full ID, or null with `commitUnavailable` saying why) and `uncommitted` (true when tracked files differed from that commit, so the commit alone does not describe what was read; false when commit is null). |
| `graphHash` | ADR 0005's hash over the whole graph, withheld artifacts included: it names the snapshot evidence is bound to, not the projection. |
| `release` | The exact product and release label the export was made for, or null. |
| `validation` | The level and scope validated, `status` (`fail` exactly when `errors` is above zero), the error and warning totals over the whole validation, and the diagnostics about exported artifacts (§3). |
| `withholding` | What was left out, and how much (§3). |
| `registries` | Owners, audiences, release dimensions, flags, evidence sources and shared resources, as declared. |
| `artifacts` | One per exported artifact (§2). |
| `reports` | Optional sections (§4). An absent section means not supplied: never zero, none or pass. |

The **snapshot** an envelope describes is the pair (`source.commit`, `graphHash`) under one `repository`. Two
envelopes with the same pair describe the same snapshot whatever their `generatedAt`, and a consumer MUST treat a
second import of it as the same snapshot rather than a new one.

## 2. Artifacts

Each artifact carries its metadata as Core §4 defines it (`id`, `type`, `title`, `status`, `owner`, `visibility`,
`audiences`, `profile`, `revision`, `availability`, `slice`, `verification`, `measure`, `tips`, `extensions`), its source `path` and
`sourceHash`, its `parent`, its authored `links` by kind, and `derived`: the inverse edges by the authored kind, so
`derived.governedBy` on a rule lists the behaviors that name it. Derived edges are never authored (Core §5).
`withheldLinks` counts the link targets and sources left out because the artifact at the other end is withheld.

`body`, the document text after the frontmatter, is present only when the export was asked for bodies. Bodies,
`extensions` and `availability` are exported as authored: what they name is the author's responsibility at the
artifact's visibility, as it is for publication, and a producer does not rewrite them.

A link MAY name an ID with no artifact in the export when validation failed (CORE003). A consumer MUST show such a link
as unresolved rather than drop it.

## 3. Withholding

A producer MUST withhold `restricted` artifacts unless the export was explicitly asked to include them. A withheld
artifact is absent from `artifacts`, `products` and every report; its ID is removed from the links, derived edges and
parent of every exported artifact, from `registries.resources[].consumers`, and from the lists inside every report; and
a diagnostic whose artifact or path is a withheld artifact's is left out of `validation.diagnostics`, while one that
names a withheld ID in its text has that ID replaced by "a withheld artifact". Every omission is counted where it
happened: `withholding.artifacts` and `withholding.diagnostics` for the envelope, `withheldLinks` per artifact, and a
`withheld` count beside each report list that was shortened. A short export never reads as a complete one.

`withholding.visibilities` lists what was withheld: `["restricted"]` by default, `[]` when restricted artifacts were
asked for. A consumer that accepts an export with nothing withheld takes on enforcing restricted visibility itself,
before any search, index or display, and SHOULD prefer the default.

Withholding is a producer's first line, not the whole of authorization. A consumer MUST still authorize every reader
against the connection and the artifact's visibility (§5), because a payload a service account may hold is not one
every person may see.

## 4. Reports

Each report is computed over the whole graph by the check that owns it and then withheld as §3 says. Each names the
snapshot it was computed at (`graphHash`, and `commit` where runs or files depend on it), which MUST be the envelope's.

### 4.1 Evidence

`reports.evidence` is produced at L3 and above, where run records are read. It names the `scope` (the exact product
and release assessed, or null for records of every scope) and the number of `records` read, and holds:

- `verifications`: one entry per exported verification with its `method`, its Core §8 `status`, a `note` when the
  status is qualified, the `latest` run record that decided it (spec/evidence.schema.json's record, unchanged), the
  results of the runs at the snapshot (`atSnapshot`), the number of in-scope `runs` at any snapshot, and the number of
  records ignored as `outOfScope`.
- `claims`: one entry per exported behavior, rule and scenario that is not retired, with its lifecycle, whether
  evidence is `required` for it at the level, whether a verification names it (`linked`), whether every verification
  naming it is a current pass (`verified`), and the verification IDs.

The statuses are Core §8's: `current-pass`, `current-fail`, `skip` and `error` are about a run at the snapshot;
`stale` means runs exist only at another commit or graph hash; `missing` means no run record; `unresolved` means the
records could not be classified. Only `current-pass` is a pass. A consumer MUST show each status distinctly, MUST NOT
fold `stale`, `missing` or `unresolved` into a pass or a failure, and MUST NOT reduce coverage to a percentage.

### 4.2 Knowledge

`reports.knowledge` holds one entry per exported knowledge artifact: its lifecycle, its review `status` (`current`
only while every source it was reviewed against still has the hash it was pinned at and a reviewer and time are named,
Core §9; otherwise `needs-review`), the `reviewer` and `reviewedAt`, the `sources` a review must pin (what it explains,
and the rules governing each explained behavior), and which of them `changed` or are `missing` a pin. The status is
computed with withheld sources included, so knowledge whose withheld source changed still reads `needs-review`.

### 4.3 Impact

`reports.impact` holds, for every exported artifact, Core §10's impact report: `direct` dependents one edge away,
`candidates` further downstream, the start's own rules, contracts and decisions as `context`, and its navigation
`ancestors`. Each hit is an artifact ID and the `path` that reached it, one step per edge with the edge's direction
(`via`) and a reason sentence; a consumer joins hits to `artifacts` by ID. A hit whose path passes through a withheld
artifact is left out and counted. A consumer MUST show direct dependents apart from candidates, with their reasons, and
MUST NOT present reachability as proof that runtime behavior changed: `note` says so, and SHOULD be shown with it.
A start with no entry was not computed, which is not the same as no impact.

### 4.4 Ownership

`reports.ownership` is produced at L2 and above, where the architecture check reads the tree. It lists every file the
check attributed, by path, with its `region` (VSA §1, §3, §5: `slice`, `composition`, `shared`, `infrastructure`,
`resource`, `backend`, `unowned`, or `test` for a test file) and its `owner`: the slice for `slice` and for a test whose
claims a slice matches, the registry resource for `resource`, otherwise null. Files outside the source and backend roots
that nothing claims are not listed. Files of a withheld slice are left out and counted. Out-of-scope files are listed:
scope decides what the check reports, not who owns a file. This is the map that turns a file, from a stack frame or a
diff, into a slice, the behaviors it implements and their owner.

## 5. Reading an export

Before an envelope replaces the snapshot a consumer holds, the consumer MUST make these checks, and on any failure
MUST reject the whole envelope, keep the prior snapshot active and say which check failed. The categories, in the order
they are reported:

| Category | The envelope… |
|---|---|
| `not-json` | is not UTF-8 JSON, or is over the consumer's size limit |
| `unsupported-contract` | has no `contract`, or one this consumer does not support |
| `malformed` | does not satisfy spec/export.schema.json, or a list of artifacts or report entries is out of order or repeats its key |
| `identity-mismatch` | has another `repository` than the connection's, or does not contain the connection's product |
| `mixed-snapshot` | carries a report computed at another commit or graph hash than its own |
| `forbidden-content` | contains an artifact of a visibility its own `withholding` says it withheld |
| `inconsistent-report` | contradicts itself: a status disagreeing with its counts, a `current-pass` decided by a run from another snapshot, a `stale` status with a run at this one, a knowledge entry `current` with changed sources, a report entry for an artifact the export lacks, an impact hit whose path does not end at it |

The first three stop the read: nothing else can be judged in a value of the wrong shape or version. The rest are all
collected, and the first in the table names the result. A schema validator alone covers `malformed` and part of
`unsupported-contract`; the other checks are the consumer's to make, and the fixtures (§6) include schema-valid
envelopes a consumer MUST still refuse. `@intentset/core` exports `readExport`, a dependency-free reader that makes
every check here, for consumers in JavaScript; its result also lists the reports supplied.

After a read succeeds, a consumer:

- MUST key artifacts by (connection, artifact ID), never by title or path, so a rename or move keeps every association;
- MUST import a snapshot it already holds idempotently (§1);
- MUST promote a new snapshot atomically: no reader sees a mix of two;
- MUST show a report it was not given as not supplied, and the four evidence states (no data supplied, not checked,
  failed, stale) apart, without a single percentage;
- MUST authorize each reader before search, retrieval or display, independently of the import's authorization;
- MUST NOT write lifecycle, evidence or knowledge status back on the strength of its own state: closing a work item
  does not release a behavior or verify it.

## 6. Fixtures

The consumer fixtures are envelopes built from the worked example, `tests/consumer/` in the reference repository and
`consumer/` in `@intentset/conformance-suite`. `manifest.json` lists each case: `name`, the envelope's `file`, the
`connection` (repository and product) it is read against, `expect`, and `notes` saying what a consumer must do. An
accepted case's `expect` gives the snapshot pair, the validation status, the reports `supplied`, the number of withheld
artifacts and, when evidence is supplied, each verification's status; a rejected case's gives the `category`. Each
rejected envelope is an accepted one with a single deliberate defect.

A consumer passes when it accepts every accepted case and shows what its `expect` says, and rejects every rejected case
with that category, without replacing the snapshot it held. The reference implementation's tests hold its reader, the
schema and the committed fixtures in agreement, and fail when the fixtures differ from what the recipe builds.

## 7. Versioning

The contract version changes whenever a reader of the previous version would reject or misread an envelope: a new
required member, a removed one, or a changed meaning. A producer writes exactly one version; a consumer names the
versions it supports and rejects the rest (§5). 0.2 was the first version a consumer could pin. 0.1 carried untyped
report slots and exported restricted artifacts by default, and no consumer was built against it (ADR 0008). 0.3 added
the `measure` artifact type, the `evidenceSources` registry, and `measure` and `tips` on every artifact (ADR 0012); a
0.2 reader would reject an envelope naming a type it did not know, so the version moved rather than the type arriving
unannounced.

The contract version and Core's `intentset.spec` move separately. While the specifications are drafts, the next change
that invalidates an existing conformance case, in any section of the suite and against any specification, moves
`intentset.spec` (Core §1), which an envelope carries in `spec`; the contract version moves only by the rule above,
and every change to either is recorded in the CHANGELOG.

## 8. Producing an export

The reference CLI writes an envelope with `intentset graph`. A CI job that feeds a consumer typically runs, after the
tests and `intentset evidence import` have written run records for the commit:

```
intentset graph --level L3 --release PRD-LANTERN:pilot-1 --report all --out intentset-export.json
```

`--report` names a section (`evidence`, `knowledge`, `impact`, `ownership`), repeatably, or `all` for every one the
level reads: ownership needs L2 and evidence L3. `--include-restricted` exports restricted artifacts (§3), and
`--include-bodies` adds bodies. A failing validation still exports, with `validation.status: "fail"`, and exits 1.
