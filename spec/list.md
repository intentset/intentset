---
title: Intentset List Contract v0.1
id: intentset/list/0.1
status: draft
revision: 2026-11-11
implementation: 0.11.0
---

# Intentset List Contract v0.1

**Extends:** [Core §10](core-0.2.md#10-human-review-impact-and-agent-context) • **Reads:** [the export contract](export.md)

A list answers one question about a product model: which records match these conditions. This document fixes the
selector that states the conditions, how a record is matched against it, what is done where the source withheld part
of the answer, and the `intentset/list/0.1` result a tool writes. MUST, MUST NOT, SHOULD and MAY are used as in Core
§1. The reference implementation is `select` in `@intentset/core` and `intentset list` in `@intentset/cli`
([ADR 0016](https://github.com/intentset/intentset/blob/main/docs/decisions/0016-list-selects-records-with-a-closed-selector.md)).

A list selects records; it computes nothing about the product. It runs no code from the repository, opens no network
connection and writes nothing (Core §11's read-only checks).

## 1. The selector

A selector is a JSON object. It is data, not a language: there is no grammar to parse, no regular expression, no
comparison operator and no sort order to choose. Each field is a condition, and **the fields combine with AND; the
values within one field combine with OR**, the rule availability already follows (Core §7). The empty selector `{}`
matches every record.

| Field | Values | A record matches when |
|---|---|---|
| `ids` | IDs | its ID equals one of them. A value ending in `*` matches every ID that starts with what is before the `*`; a `*` anywhere else is an error. |
| `types` | artifact types (Core §2) | its `type` is one of them |
| `statuses` | statuses (Core §7) | its `status` is one of them |
| `owners` | owner identifiers | its `owner` is one of them |
| `audiences` | audience identifiers | one of its `audiences` is one of them |
| `visibilities` | visibilities (Core §4) | its `visibility` is one of them |
| `under` | IDs | one of them is on its navigation chain (§1.2) |
| `availability` | an object, §1.1 | every dimension it names matches |
| `hasExtension` | extension keys | its `extensions` has one of the keys |
| `links` | link predicates, §1.3 | every predicate holds |
| `describing` | slice IDs | it is one of the records that describe one of the slices (Core §10) |
| `claims` | repository-relative paths | it is a slice, not retired, with a claim matching one of the paths (VSA §3) |

Every list holds at least one value, each a nonempty string; types, statuses and visibilities are the closed sets of
Core. A key that is not a field above is an error, as is a value outside a closed set, an empty list, or a field of
the wrong shape. A tool MUST reject such a selector whole, saying where each problem is as a JSON pointer, and MUST NOT
ignore a key it does not know. A reader writes the selector back **normalized**: each list sorted by code point with
duplicates removed, and each link predicate's `quantifier` written out.

A value of an owner, audience, release, role, edition or flag that the source's registries do not hold is not an
error, since the selector's question is still well formed, but it matches no record, and the result says so in its
notes (§5).

### 1.1 Availability

`availability` is an object of one or more of `products`, `releases`, `roles`, `editions`, `flags` and `notReleases`,
each a list. A positive dimension matches when the record's availability names one of the listed values in that
dimension. `notReleases` matches when the record's `releases` names none of them. Matching is exact: release labels
are opaque (Core §7), so "new in `pilot-2`" is `releases: ["pilot-2"], notReleases: ["pilot-1"]`, and a list never infers an
order between labels. A record with no availability has no value in any dimension: it matches no positive dimension
and every `notReleases`.

Status and availability are authored claims. A result whose selector names `availability` says that it is not a
reviewed release snapshot (§5).

### 1.2 Under

`under` follows `parent` from the record toward the product, as an impact report's ancestors do (Core §10), and
matches when one of the listed IDs is reached. The record itself is not under itself. A chain that reaches an ID the
source does not hold stops there.

### 1.3 Link predicates

A link predicate is an object:

| Key | Meaning |
|---|---|
| `direction` | `out`, the links the record authors, or `in`, the links authored to it (Core §5's derived inverses) |
| `kind` | a relationship of Core §5, `parent` included |
| `quantifier` | `some` (the default), `none` or `all` |
| `match` | optional: a selector the record at the other end must match |

The ends are the records at the other end of the record's `kind` links in that direction. With `some`, the predicate
holds when at least one end matches; with `none`, when no end does; with `all`, when every end does, which is true of a
record with no such links. `all` requires `match`. Without `match` every end matches, so `some` asks whether the record
has such a link and `none` whether it has none. An end that names an ID the source does not hold matches no `match`.

**A predicate looks one hop.** `match` holds only the fields a record answers by itself (`ids`, `types`, `statuses`,
`owners`, `audiences`, `visibilities`, `under`, `availability`, `hasExtension`); `links`, `describing` and `claims`
inside it are errors. The predicates in `links` are separate conditions, combined with AND.

### 1.4 Describing and claims

`describing` uses the definition of Core §10: the slice itself, the behaviors it implements, the rules governing them,
the scenarios illustrating them, the verifications of any of those, the contracts it exposes, and the decisions
informing the slice, its behaviors or its contracts. `claims` uses VSA §3's patterns, matched as `review` and
`context` match them. A tool MUST use these definitions as they are, and a consumer SHOULD call the implementation's
rather than copy it.

## 2. Sources

A list is made over one snapshot, read from the repository's tree or from an export.

- **From the tree**, the records are those the validation read, seen through the export's projection (export §3):
  restricted artifacts are withheld unless the caller asked for them, their IDs are removed from the links of what is
  seen, and each record counts the link ends it lost.
- **From an export**, the records are the envelope's `artifacts`, as checked by a consumer's reading (export §5). A
  tool reads nothing else of the repository.

The two MUST give the same answer for the same snapshot and the same withholding: the same counts, the same matched
IDs and the same undetermined IDs. A field the source does not carry is `not-supplied` in a row (§5), never null or
empty: export 0.4 does not carry Core §4's `reviewedBy` and `reviewedAt`.

A list is made whether or not the validation passed. A failed validation may leave records out of the graph, so the
result names the validation's status and totals beside the answer.

## 3. Undetermined

Where a record is seen and the answer for it depends on a link end the source withheld, the record is
**undetermined**: it is neither matched nor unmatched, it is counted and listed apart, and a check over the result
MUST NOT read it as either (Core §11: what could not be checked is reported). The answer is computed with three values,
yes, no and undetermined, and

- AND is no if any condition is no, else undetermined if any is, else yes; OR is yes if any is yes, else undetermined if
  any is, else no;
- a link predicate counts a withheld end as an undetermined end, where the record has withheld ends and its type can
  have a `kind` link in that direction at all (Core §5's endpoints). An export says how many of a record's link ends it
  withheld, not of which kind, so this is conservative: a record whose visible ends already decide is never
  undetermined;
- `under` is undetermined when the chain stops at a record whose parent may have been withheld: one with withheld ends
  and a type that has a parent;
- `describing` is undetermined for a record a withheld artifact could have connected to the slice: one reached when
  each withheld end of the kind a step of Core §10's definition follows is taken to reach any seen record of that
  step's type that has withheld ends itself, and not reached without them. A slice the source does not show is,
  where the source withheld anything, a slice that may be withheld.

A field of the record's own (`ids`, `types` and the rest, `availability` and `claims`) is never undetermined: a record
that is seen is seen whole.

## 4. Counting by a field

A tool MAY count the matched records by one field: `type`, `status`, `owner`, `visibility`, `audience`, `product`,
`release`, `role`, `edition` or `flag`, the last five from availability. A field a record can hold several values of
(`audience` and the availability dimensions) counts the record once under each value it holds and under null when it
holds none, so the counts can sum to more than the records matched, and the result says the field is multi-valued.
Groups are sorted by value, null last. A count is a number of records: a list never writes a percentage.

## 5. The result

A list's result is one JSON object, `intentset/list/0.1`. Its lists are sorted, so the same source and the same
selector give the same bytes.

| Field | Meaning |
|---|---|
| `contract` | `intentset/list/0.1`. A reader MUST reject any other value. |
| `source` | `tree` or `export` (§2) |
| `snapshot` | `repository`, `commit` (null with `commitUnavailable` saying why), `uncommitted` (whether tracked files differed from the commit), `graphHash`, and, from an export, its `generatedAt` |
| `validation` | the `level` validated at, its `status` (`pass` or `fail`), and its `errors` and `warnings`, withheld artifacts included |
| `selector` | the selector, normalized (§1) |
| `counts` | `considered` (records seen and tried), `withheld` (records the source withheld, not tried), `matched` and `undetermined` |
| `rows` | one per matched record, sorted by ID: `id`, `type`, `title`, `status`, `owner`, `visibility`, `audiences`, `path`, `parent` (null when there is none or it is withheld), `availability` (null when there is none), `reviewedBy` and `reviewedAt` (null when the record names none, `not-supplied` when the source does not carry them) |
| `undetermined` | the IDs of the undetermined records, sorted |
| `countBy` | null, or the count of §4: `field`, `multiValued`, and `groups` of `value` and `count` |
| `notes` | sentences a reader needs to read the answer right, in a fixed order: that status and availability are authored claims, when the selector names availability; each value no registry holds; each `describing` ID that is not a slice the source shows |

No count is a percentage, and every count names its denominator: `considered` and `withheld` together are the records
of the snapshot.

## 6. The command

`intentset list` compiles its options to a selector, or reads one from a file, and prints the result.

| Option | Selector |
|---|---|
| `--id`, `--type`, `--status`, `--owner`, `--audience`, `--visibility`, `--under` | `ids`, `types`, `statuses`, `owners`, `audiences`, `visibilities`, `under` |
| `--product`, `--release`, `--not-release`, `--role`, `--edition`, `--flag` | the dimensions of `availability` |
| `--has-extension <key>` | `hasExtension` |
| `--has [some:\|none:\|all:]<out\|in>:<kind>[=<status>,…]` | one link predicate; `=` gives the far end's statuses as `match` |
| `--describing <slice>`, `--claims <path>` | `describing`, `claims` |
| `--where <file.json>` | the whole selector, as JSON; it does not combine with the options above |

An option may be repeated, and a value may be a comma-separated list, except `--claims`, whose value is one path; the
values of one option combine with OR. `--from <export.json>` reads the records from an export (§2), and
`--include-restricted` from the tree selects over restricted artifacts too. `--count-by <field>` adds §4's count.
`--format` is `table` (the default), `json` (the result of §5) or `ids` (one matched ID per line, nothing else on
standard output).

**Exit codes.** 0 when the list answered, whatever the validation's status, which the result names; 1 with `--check`
when at least one record matched or is undetermined, so a gate never passes on an answer it could not give; 2 for an
invocation error, a selector §1 rejects included.

## 7. Conformance

`tests/list.json` holds the cases, each a repository tree, a `selector`, an optional `countBy`, and in `list` the fields
of the result that must match (a deep partial, as an export case's `export` is). A selector §1 rejects is expected as
`list: { "problems": [...] }`, one entry per problem with its `pointer`. A case's name begins with its catalog ID:

| ID | What the cases hold |
|---|---|
| L01 | Fields combine with AND |
| L02 | Values in a field combine with OR; an empty list is rejected |
| L03 | IDs match exactly, or by prefix with a trailing `*` |
| L04 | `under` follows the navigation chain, the record itself excluded |
| L05 | Availability matches exactly, and `notReleases` matches a record with none |
| L06 | Link predicates: `some`, `none` and `all`, `match` on the far end, and one hop |
| L07 | A withheld link end leaves the answer undetermined unless the visible ends decide it |
| L08 | `describing` and `claims` use Core §10's and VSA §3's definitions |
| L09 | An unknown key is rejected, at any depth |
| L10 | The same input gives the same bytes |
| L11 | Counting by a field |

A conforming driver also checks, for every case, that the list from the tree and the list from the tree's export
agree (§2), and that reading the documents in reverse order gives the same bytes.

## 8. Versioning

The result's contract version changes when a reader of the previous version would reject or misread a result: a new
required member, a removed one, or a changed meaning. A new selector field is not such a change, since a selector
that names it was rejected before. The contract versions separately from `intentset.spec` and from the export
(export §7).
