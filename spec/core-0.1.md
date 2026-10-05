---
title: Intentset Core Specification v0.1
id: intentset/core/0.1
status: draft
revision: 2026-10-05
implementation: 0.6.0
---

# Intentset Core Specification v0.1

## 1. Purpose and scope

Intentset is an open framework for keeping product intent, observable behavior, implementation, verification, and published knowledge connected. Repository files are authoritative; the graph, Atlas, reports, and customer knowledge are derived views. A graph database is not required.

This specification defines product semantics and interchange. The [VSA specification](vsa-0.1.md) adds implementation ownership and architecture constraints. The [reference profile](profile-typescript-amplify-gen2-0.1.md) maps those constraints to TypeScript and Amplify Gen 2. Core adoption does not require either architecture or platform.

MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY express requirements in this draft. SHOULD departures require a recorded reason. Examples are informative unless a rule explicitly makes them normative. The CLI, Atlas, publisher, and MCP server named here ship in the TypeScript reference implementation (`@intentset/*` on npm), whose conformance suite is published for other implementations; this specification, not that implementation, is normative.

**Change policy.** The five Intentset specifications are drafts. Each opens with its `id`, `status`, `revision` (the date its text last changed) and `implementation` (the reference release that implements that revision), and every change is recorded in the repository's CHANGELOG. The conformance suite decides what kind of change a revision is, in every section of it (`core`, `vsa`, `evidence`, `publication` and `export`), whichever specification the case belongs to: one that invalidates an existing case, changing its `valid` or `diagnostics` so that a repository which conformed before no longer does, is breaking; one that leaves every existing case as it was, such as a new optional field, a new check with cases of its own, or a clarification, is not, and neither is one that only relaxes a case so that nothing which conformed stops conforming, as 0.2.0 did when VSA §3 made two errors warnings for draft slices. `intentset.spec` is the one version a record declares, so it answers for all of them: while the specifications are drafts, the next breaking change to any specification, VSA, the reference profile and the publication profile as much as Core, moves `intentset.spec` from `0.1` to `0.2`, and documents declare the new value; until 2026-10-05 breaking changes stayed inside `0.1`, and one did. The export envelope versions separately ([export contract §7](export.md#7-versioning)).

Breaking revisions within `0.1`, recorded so that a reader who conformed earlier knows why they no longer do:

| Revision | Change |
|---|---|
| 2026-10-04 | An active outcome MUST have a measure (§5, CORE003; ADR 0012). A repository with an outcome past draft and no measure validated on 2026-10-03 and fails from this revision; while the outcome is draft it is a CORE009 warning. |

## 2. Semantic model and granularity

| Type | Meaning | Review question |
|---|---|---|
| `product` | Product identity and scope | What system are we describing? |
| `intent` | Strategic purpose | Why should this product exist or change? |
| `outcome` | Desired measurable change | What improvement will show success? |
| `measure` | How one outcome is judged: metric, baseline, target, window, source | What reading will tell us the outcome was achieved? |
| `capability` | Stable product ability | What can a user accomplish? |
| `behavior` | Observable action or response under stated conditions | What exactly does the system do? |
| `rule` | Constraint governing behavior | What must remain true? |
| `scenario` | Concrete conditions, action, and expected result | What example would demonstrate the promise? |
| `slice` | Implementation owner of a cohesive set of behaviors | Where is the behavior delivered? |
| `contract` | Maintained interface between implementation owners | What may another component rely on? |
| `verification` | Definition of an executable check or review procedure | How is a claim assessed? |
| `knowledge` | Audience-specific explanation grounded in product artifacts | What may we tell this audience? |
| `decision` | Architecture/product decision and rationale | Why was this design selected? |

A capability MAY contain many behaviors and map to several slices. A behavior SHOULD contain one recognizable promise, including its failure response. Split it when release, ownership, availability, or independent review differ. A rule MAY govern many behaviors; it MUST NOT be duplicated solely to appear in multiple capability pages. A scenario is an example, not proof that all cases work.

Recommended human decomposition is product → intent → outcome → capability → behavior, with each outcome's measures beside it. This is a navigation spine in a typed graph, not a demand that reality form one tree. Technical detail belongs in rules, scenarios, decisions, and implementation views; strategic reviewers should start at capabilities and drill down.

## 3. Authoritative representation

Each artifact MUST have exactly one authoritative UTF-8 Markdown document with YAML frontmatter in the declared repository scope. Slice documents are named `slice.md` in this profile; other filenames are not identity. Markdown with frontmatter is the one v0.1 carrier, so records and their explanation travel together. A later standalone YAML binding MAY be specified; v0.1 tools MUST NOT silently merge duplicate records.

Frontmatter MUST be the first block between `---` delimiters. It MUST decode to a JSON-compatible object. Reject duplicate keys, custom YAML tags, merge keys, aliases, and non-finite numbers. Quote dates and version strings. Implementations MUST limit file size, nesting, and parser resource use. Document bodies MUST NOT execute code or templates. Ordinary code fences remain inert text.

```yaml
---
markset: 0
intentset:
  spec: "0.1"
  profile: intentset/behavior/0.1
  id: BEH-ASMT-SCHEDULE
  type: behavior
  title: Schedule an assessment
  status: approved
  owner: team-assessment
  visibility: internal
  audiences: [engineering, product]
  parent: CAP-ASMT-ASSIGN
  links:
    governedBy: [RULE-ASMT-FUTURE]
  availability:
    products: [PRD-LANTERN]
    releases: ["pilot-1"]
    roles: [teacher]
    editions: [standard]
    flags: []
---
```

`markset` is required by the Intentset Markset binding, not by language-neutral graph interchange. `intentset.profile` is an Intentset-owned semantic profile identifier; it is not a claim that Markset has registered a profile API. Unknown top-level frontmatter is preserved, but cannot alter Intentset semantics. Unknown keys inside `intentset` are errors except under `extensions`.

## 4. Common fields and identity

Required common fields are `spec`, `profile`, `id`, `type`, `title`, `status`, `owner`, `visibility`, and `audiences`. `spec` is the string `0.1`. `profile` MUST equal `intentset/<type>/0.1`. `id` MUST match `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$` and be unique within the product graph. IDs are case-sensitive, immutable, independent of title/path, and MUST never be reused. Recommended prefixes are PRD, INT, OUT, MEAS, CAP, BEH, RULE, SCN, SLICE, CONTRACT, TEST, KB, ADR. Prefixes aid humans; `type` determines semantics.

`owner` is one accountable team/role identifier from the repository's owner registry. `audiences` is a nonempty array from its audience registry. These are documentation audiences, not runtime authorization. `visibility` is `public`, `customer`, `internal`, or `restricted`. Missing access information MUST fail closed for publication.

Optional common fields: `parent`, `links`, `availability`, `revision`, `reviewedAt`, `reviewedBy`, `extensions`. `revision` is a positive integer incremented for semantic changes. Review fields identify a review record, not automated proof. Extensions MUST be namespaced (for example `org.example/change`) and cannot redefine core fields. Source hashes and commit IDs are computed externally, not manually maintained in every document.

Moving a file or correcting wording does not change identity. Splitting a behavior creates new IDs and preserves the old artifact as retired with `replacedBy` links. Merging works similarly. Historical release snapshots keep the earlier meaning.

## 5. Relationships and cardinality

Relationships are authored once, in the direction below. Reverse edges are derived and MUST NOT be separately maintained. References MUST resolve in the same graph snapshot. External issue/PR URLs belong in `extensions`, never as dangling internal IDs.

| Field / relationship | Source → target | Cardinality and meaning |
|---|---|---|
| `parent` | intent → product; outcome → intent; measure → outcome; capability → outcome or capability; behavior → capability | Exactly one except product; navigation parent |
| `governedBy` | behavior → rule | Zero or more constraints |
| `illustrates` | scenario → behavior | One or more behaviors exemplified |
| `implements` | slice → behavior | One or more for product slices; authoritative ownership |
| `dependsOn` | slice → slice | Zero or more implementation dependencies |
| `exposes` | slice → contract | Zero or more public contracts |
| `consumes` | slice → contract | Zero or more consumed contracts |
| `verifies` | verification → behavior, rule, or scenario | One or more assessed claims |
| `explains` | knowledge → behavior, rule, or capability | One or more sources of knowledge |
| `informedBy` | slice, contract, or behavior → decision | Zero or more supporting decisions |
| `requires` | behavior → behavior | Zero or more functional prerequisites |
| `supports` | outcome → intent; capability → outcome | Additional associations beyond the navigation parent |
| `replacedBy` | retired artifact → same type | One or more successors when applicable |

All arrays contain unique IDs. Self-edges, duplicate edges, invalid endpoint types, cycles in `parent`, cycles in `replacedBy`, and cycles in `requires` are errors. Other cycles are evaluated by the relevant profile; `dependsOn` is governed by VSA. Each non-root navigation chain MUST reach a product. An artifact without a navigation parent is reached through its typed relationships. Active rules MUST have an incoming `governedBy`; active scenarios, verifications, and knowledge MUST have their corresponding outgoing links. An active outcome MUST have at least one measure whose `parent` it is: an outcome past draft says how it will be judged, and the capabilities under it do not say that. Draft unattached artifacts, and a draft outcome with no measure, produce warnings.

At VSA adoption, an approved, implemented, released, or deprecated behavior MUST have exactly one accountable product slice through `implements`. Other collaborating slices appear through slice dependencies and contracts. Exactly one owner keeps accountability unambiguous while still allowing multi-slice implementations. A slice MUST NOT implement a behavior already owned elsewhere.

## 6. Required narrative by artifact type

Every document MUST contain a level-one heading matching its title and substantive prose. Validators can check section presence; reviewers determine semantic adequacy.

| Type | Required level-two headings |
|---|---|
| product | Scope |
| intent | Rationale |
| outcome | Measure |
| measure | Method |
| capability | Overview |
| behavior | Behavior; Preconditions; Outcomes |
| rule | Constraint |
| scenario | Given; When; Then |
| slice | Responsibility; Public contract; Verification |
| contract | Interface; Compatibility |
| verification | Procedure; Expected result |
| knowledge | Guidance |
| decision | Context; Decision; Consequences |

A behavior MUST identify actor, trigger, observable success response, and meaningful failure response in these sections. An intent's Rationale MUST name the problem or opportunity the change answers: the reason a reader would start the work at all, not a restatement of the title. An outcome's Measure summarizes how the outcome will be judged and which measures judge it; the metric, baseline, target, window and source live in the outcome's measure records, below. A measure's Method MUST say how the reading is taken, by whom or by what, and what would make it untrustworthy. A verification's Procedure MUST identify automation or a reproducible manual review; neither a filename nor a test count is sufficient.

A measure judges one outcome, its `parent`, and carries a `measure` metadata block: `metric`, an identifier in lower case with words joined by `_` or `-`, named the way the evidence source names it; `baseline`, the value before the change or the literal `unknown` when none has been taken, never omitted; `target`, the value or threshold that would show the outcome was achieved; `window`, when the reading is taken, relative to a release or a date; `source`, an entry in the repository's `evidenceSources` registry naming where the evidence is expected to come from (an analytics product, a study, a survey); and optionally `direction`, `increase` or `decrease`, which way the metric moves when the outcome is achieved. Values other than `metric` and `direction` are prose, not parsed: a target of `under 2 days` and a window of `90 days after pilot-1` are complete. A `measure` block on any other type is an error, as a `verification` block is (§8). Intentset defines what success means; it does not collect telemetry, run queries or compute a metric, which belong to the systems the registry names.

Verification (§8) and measurement answer different questions and neither stands in for the other. Verification asks whether the behavior was built as described; a measure asks whether building it produced the outcome. A behavior can be implemented correctly, pass every check and ship, and the outcome above it can still fail; the model MUST be able to say so, which is why an outcome's measures are records of their own rather than a sentence in the outcome.

## 7. Lifecycle, release, and version semantics

`status` is `draft`, `approved`, `implemented`, `released`, `deprecated`, or `retired`. Default progression follows that order. Drafts may be retired without release. Returning to draft requires a review note and MUST NOT rewrite immutable release snapshots. Released artifacts are changed through a new snapshot; their ID remains stable only when meaning remains recognizably continuous.

Status is an editorial claim, not a test result. `approved` records intent; `implemented` records an implementation claim; `released` requires inclusion in a reviewed release snapshot. `deprecated` remains available until the stated removal; `retired` is excluded from current publication and retained for history.

A release snapshot records product ID, exact release label, source commit, graph hash, specification/profile versions, and build time. Release labels are opaque strings: v0.1 performs exact matching, not inferred SemVer ordering. `availability`, required on behaviors and knowledge, contains nonempty `products`, `releases`, `roles`, and `editions` arrays plus a `flags` array. All named flags are required; empty means no flags. No implicit wildcard is allowed. Applicability is AND across dimensions and OR within an array. The repository registries define valid dimension values.

A release may include deprecated behavior; prospective documentation MAY describe future work only in a separately labeled roadmap projection. A status of “released” alone MUST NOT make a feature available to all customers.

## 8. Verification definitions and run evidence

Verification nodes identify checks. Evidence is a separate run record, since runs change more frequently than product semantics. `verification` metadata contains `method` (`automated` or `manual`), `locator` (repository-relative path), and `selector` (stable test or review case identifier).

A run record MUST include evidence ID, verification ID, source commit, graph hash, environment, exact product/release scope, tool/version or reviewer identity, start/end UTC timestamps, result (`pass`, `fail`, `skip`, `error`), and an evidence URI. A manual record also MUST identify reviewer and review rationale. URI presence is not proof of trustworthy execution; evidence producers and stores must be controlled by the adopting organization. A run record with a problem is EVID001 and never counts; the evidence codes are in §11.

Only `pass` at the assessed commit and graph hash counts as current passing evidence in v0.1. Any older evidence is stale. This deliberately conservative policy avoids pretending change-impact analysis proves unrelated code safe. Skip, error, absence, and stale runs MUST NOT count as pass. Link coverage and current passing coverage MUST be displayed separately. A failing current run MUST remain visible even if a prior run passed.

*Informative: where run records live.* Because a pass counts only at the assessed commit, a run record committed to the repository it assesses describes a commit that is no longer the latest the moment it lands, and reads as stale. Keep run records in CI artifacts or another store the adopting organization controls, never in the commit under assessment. (Found by the Streamlane pilot, 2026-10-02.)

*Outcome evidence.* A measure's reading is evidence of a different kind from a run record, and no v0.1 tool reads one. When a later version or an external system such as a usage product supplies it, an outcome evidence record names the measure ID, the window it was read in, the observed value, the source it came from, the time of the reading and an evidence URI, and it says whether the target was met. It is never current in the sense a run record is: a reading is bound to a window, not to a commit and graph hash, and an outcome met in one window may be missed in the next. Until that record is specified, such evidence travels in namespaced `extensions`, which every tool preserves and none interprets.

A claim is “verified in snapshot” only if every applicable required verification linked to it passes. Scenarios and governing rules require their own coverage; a parent behavior pass does not silently satisfy them. Manual and automated coverage MUST be separately countable. Structural validation cannot prove that tests adequately assert the documented behavior.

## 9. Markset profiles and document publication

Intentset owns metadata, required sections, semantic validation, graph resolution, and publication policy. Markset owns document syntax and rendering. The reference implementation MUST accept Markdown + YAML frontmatter and support Markset validation/rendering through a version-pinned adapter. Plain Markdown fallback MUST remain readable. Profiles MUST NOT introduce `:::behavior`, `:::rule`, or any other new Markset directive.

The profiles are `intentset/<type>/0.1`, plus generated `intentset/atlas/0.1` and `intentset/publication/0.1`. Generated profiles are publication outputs, not canonical graph nodes. Metadata validation and Markset validation MUST produce separately identifiable diagnostics. A successful render MUST NOT imply semantic conformance.

Use ordinary Markdown links with repository-relative paths for authored cross-references. ID resolution is an Intentset graph function. Symbolic-reference syntax and a Markset-native profile registry are deferred; no new syntax is assumed in v0.1. Bodies MAY use any construct in Markset's closed vocabulary, which Markset validates; the records in the worked example are plain Markdown. The reference implementation pins Markset's parser and renderer to one exact version, named by its adapter, and moves the pin deliberately, so two packages never read one document with two parsers. Markset's own guide for writing its syntax is [markset.org/guide.md](https://markset.org/guide.md).

Publication pipeline:

```text
Canonical files → validated graph → exact release snapshot
                → authorized audience projection → reviewed knowledge
                → generated Markset → HTML / portable text / retrieval chunks
```

A publisher MUST select authorized artifacts before sending text to a renderer or language model. It MUST deny by default, intersect product/release/role/edition/flag availability, restrict visibility and audience, and exclude draft/retired material. Public projection allows public records only. Customer projection allows public and customer records, with authenticated entitlements; internal/restricted data require separate explicit authorization. Knowledge bodies are curated audience-safe text, not automatically copied engineering prose.

A knowledge record MAY carry `tips`: a mapping from an ID in its `links.explains` to one sentence of plain text, on one line and at most 160 characters, for a product to show beside the control that delivers that behavior or enforces that rule. A tip is the knowledge at its shortest, so it is written on the knowledge record and reviewed, projected and published with it; it is never copied from the explained record, whose prose is written for another audience. A key that is not in `links.explains` is CORE003. A tip that is not a string, is empty, begins or ends with whitespace, breaks a line or exceeds the limit is CORE001, as is `tips` on any other type. The [publication profile](publication.md) says how tips reach a product.

Each published knowledge document MUST retain source IDs, source revisions/hashes, snapshot ID, audience, availability, reviewer, and publication timestamp. If a source changes, dependent knowledge becomes `needs-review` and MUST NOT be republished as current until reviewed. Generated files MUST be marked derived and MUST NOT be edited as canonical truth. A reference to an excluded source MUST fail publication or be replaced with an explicitly reviewed safe explanation; it MUST NOT leak the source title or internal path.

Retrieval chunks MUST inherit the same access filters and provenance. Authorization must occur before retrieval and again before response assembly; filtering only the final answer is insufficient. Answers MUST cite eligible knowledge, disclose unavailable evidence, and abstain when the requested version is unknown. Documentation metadata MUST NOT be used to grant runtime product access. Generated prose needs review; graph connectivity alone cannot establish that it is accurate.

## 10. Human review, impact, and agent context

An Atlas SHOULD provide: product/capability overview; behavior detail; engineering ownership; verification status; publication readiness. Summary counts MUST disclose snapshot, denominator, scope, and whether they measure links or current pass evidence. The UI MUST expose missing/stale evidence rather than replace it with a generic green status.

Impact reports MUST show direct changes separately from candidate downstream effects. Starting at an ID, traverse reverse relationships to dependent behaviors, owners, verifications, and knowledge; include outgoing rules, contracts, and decisions as review context. Traverse reverse slice dependencies transitively, with a visited set. Include parent ancestors for navigation. Record each path/reason; do not label reachability as proof that runtime behavior changed.

Before an agent edits implementation it SHOULD load the owning slice, behaviors, rules, scenarios, contracts, and decisions. Afterward it SHOULD update affected semantics and checks in the same review. Agents MUST NOT self-approve release/publication simply because validation passes. MCP and CLI context results MUST identify snapshot and source paths; customer tools MUST use the restricted publication index, never raw engineering context.

A review of a change SHOULD list each slice whose implementation changed while none of the records describing it did. A slice's implementation is what its `source`, `backend`, and `contract` claims match, record files excepted. The records describing it are the slice, the behaviors it implements, the rules governing them, the scenarios illustrating them, the verifications of any of those, the contracts it exposes, and the decisions informing the slice, its behaviors, or its contracts. The list is a prompt for review, not a failure: a change that alters no behavior MAY say so for named slices where its reviewer reads it, such as a commit trailer, and a tool MAY then treat those slices as acknowledged, but MUST still list them.

## 11. Conformance and diagnostics

Conformance is a claim about a declared repository scope and snapshot, not a universal product certification. Publish the spec/profile versions, scope, exclusions, waiver count, checker version, and report hash.

| Level | Required conditions |
|---|---|
| L1 Product model | Parse, identity, fields, typed links, hierarchy, lifecycle, narrative checks pass |
| L2 Traceable implementation | L1 + VSA ownership and path attribution for adopted behavior scope |
| L3 Verified product | L2 + applicable behavior/rule/scenario verification definitions and current passing evidence |
| L4 Published knowledge | L3 + reviewed audience projections with availability and provenance checks |
| L5 Continuous product truth | L4 + required CI checks, architecture enforcement, impact reports, release snapshot automation and versioned agent context |

A partial adoption MUST name included capabilities/IDs and show out-of-scope counts; it MUST NOT advertise repository-wide L3 when only a pilot passed. A waiver does not erase a failed MUST: report “with exceptions,” not unqualified conformance. Recommended checks:

| Code | Condition | Default |
|---|---|---|
| CORE001 | Invalid carrier, schema, or required section | Error |
| CORE002 | Duplicate/reused ID | Error |
| CORE003 | Unresolved, wrong-type or missing required relationship | Error |
| CORE004 | Invalid/cyclic decomposition or replacement | Error |
| CORE005 | Lifecycle/release claim inconsistent | Error |
| CORE006 | Missing applicable ownership (L2+) | Error |
| CORE007 | Missing/failing/stale required evidence (L3+) | Error; a warning for a draft behavior, rule or scenario that no verification definition names |
| CORE008 | Unauthorized/stale publication (L4+) | Error |
| CORE009 | Draft unattached artifact, or draft outcome with no measure | Warning |

Configuration and run records have codes of their own, reported before or beside the checks above. A configuration error stops the run it configures; a run record with a problem is never evidence.

| Code | Condition | Default |
|---|---|---|
| CFG001 | `.intentset/config.yaml` (origin `profile`) or `.intentset/architecture.yaml` (origin `architecture`) does not parse, names an unknown key, or gives a key the wrong shape or an invalid pattern | Error |
| CFG002 | The registries file does not parse, names an unknown registry, or a registry is not a list of unique non-empty strings (`resources`: a list of resource records with known keys and unique IDs) | Error |
| EVID001 | A run record is malformed (§8: a required field missing or of the wrong type, the file not an array of records, an evidence ID repeated), or a manual run names no reviewer or rationale | Error |
| EVID002 | A run record names an ID that is not a verification in the graph, so it is evidence for nothing | Warning |
| EVID003 | A verification's `locator` is not a file in the repository tree | Warning |

Diagnostics MUST identify code, severity, origin, artifact, path, field/location, explanation, and remediation. `origin` names the stage that reported it, and keeps Markset's diagnostics apart from Intentset's: `syntax` (Markset, §9), `profile` (the carrier, frontmatter, required sections, configuration and registries), `graph` (identity, relationships and lifecycle across records), `architecture` (VSA and its profiles), `evidence` (run records, §8), `publication` (the [publication profile](publication.md)), and `render` (a renderer, reserved: no v0.1 check reports it). No other value is valid. Sort by path, artifact ID, code. Validation MUST be deterministic for identical inputs and MUST NOT silently rewrite files. CLI exits are 0 pass, 1 validation failure, 2 invocation/tool failure (ADR 0004). JSON reports MUST preserve warnings separately.

## 12. Portability and exclusions

A normalized JSON graph MUST retain metadata, body, source path, source hash, and explicit edges; serialization MUST preserve unknown namespaced extensions. The interchange form is the [export contract](export.md): its envelope, its optional evidence, knowledge, impact and ownership reports, what it withholds, and what a consumer checks before importing it. Round trips MUST preserve semantics, not YAML formatting. Generated inverses MUST be marked derived. Importers for issue trackers/ReqIF/OSLC are later adapters and MUST report lossy mappings. Tickets describe changes; product artifacts describe ongoing behavior.

v0.1 does not mandate a database, hosted service, test framework, cloud, commercial product, or universal AI correctness score. It does not assert that documented intent and production reality can be equated by static validation.
