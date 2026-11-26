# The packages' API

Loaded when an agent works under `packages/`; the repository's rules are in the root `CLAUDE.md`. Paths are
repository-relative.

## Core API (the contract every package builds against)

```ts
// @intentset/core
parseYaml(text): { value: Record<string, unknown>; error: null } | { value: null; error: { message; line } }  // strict, ADR 0001
plainCarrier(path, source): DocumentInput                     // plain-Markdown fallback, ADR 0003
readArtifact(input: DocumentInput): { artifact: Artifact | null; diagnostics: Diagnostic[] }   // CORE010, CORE011, CORE001, origin "profile"
readRegistries(text, path): { registries: Registries; diagnostics: Diagnostic[] }
readConfig(text, path): { config: Config; diagnostics: Diagnostic[] }   // Config = { repository, scope[], registries|null, ignore[], evidence: { binding: "subject"|"commit"|null, globalInputs[] } }
validate(inputs: DocumentInput[], registries: Registries, options?: { level }): ValidationResult   // the whole L1 pipeline
impact(graph: Graph, id: string): ImpactReport
readSelector(value): { ok, selector } | { ok: false, problems }   // spec/list.md §1: closed, AND across fields, OR within
select(graph | checkedExport, selector, { includeRestricted?, registries? }): Selection   // throws on a rejected selector
listOutput(selection, { source, snapshot, validation }, countBy?): ListOutput   // intentset/list/0.1; exportListMeta(envelope)
deliveryOf(meta): "planned" | "built" | null   // Core §7, ADR 0017, ADR 0023: the field, else built for deprecated, else null
activeSlices, claimingSlices(graph, path), isSliceCode, describingRecords(graph, slice), matchGlob, matchAny
// Core §10's slice definitions, moved from the CLI in 0.11.0 (ADR 0016)
impactReport(graph, starts?): ImpactReportSection           // reports.impact: every artifact's impact, hits as ID + path
exportGraph(result: ValidationResult, registries, meta): ExportEnvelope   // meta.reports, meta.includeRestricted (spec/export.md)
readExport(text | bytes | value, { repository?, product?, maxBytes? }): { ok, envelope, supplied } | { ok: false, category, problems }
// the consumer's checks of spec/export.md §5; shape checks mirror export.schema.json (a mutant test holds them equal)
// report builders live with their checks: evidenceReport (verification), knowledgeReport (publisher), ownershipReport (architecture)
graphHash(graph): string; canonicalJson(value): string; sha256Hex(input): string
contentHashOf(frontmatter, body): string   // publication §3, ADR 0018: what a content-v1 pin holds; every Artifact carries contentHash
exportApproval(meta.approval): ExportApproval | null; exportFormalizes(meta.formalizes ?? []): ExportFormalized[]
// Core §7 and §5, ADR 0020: the two fields as the export, `context --json` and the MCP tools carry them;
// approvalSummary, formalizedSummary are the one-line text the CLI and the Atlas show
sortDiagnostics, compareDiagnostics, hasErrors, and every type in types.ts
```

```ts
// @intentset/verification  (evidence is judged under a binding, Core §8, ADR 0013)
readRunRecords(json, path); classifyEvidence(graph, records, snapshot); checkEvidence(graph, records, snapshot, options)
// snapshot = { commit, graphHash, scope?, binding?, bindingReason?, subjects?, changedSince?, covers? }: commit binding unless it says subject
resolveBinding(configured, hasSlices): { binding, reason }; hasSliceClaims(graph); subjectsFor(graph, source)
staleReport(graph, classification): { needRun, manual, counts }; runnerArguments(format, entries)   // `intentset evidence stale`: what needs a run
computeSubject(input): { hash, parts, unexercised }; movedParts(a, b); partsChangedAmong(subject, changedFiles)   // the subject hash
// @intentset/architecture
subjectSource(graph, registries, tree, { globalInputs, readFile })   // claimed files, resources, a test's local imports, covers(path); a subject is computed one way (ADR 0026)
```

```ts
// @intentset/publisher
publish(graph, registries, request, { snapshot, publishedAt, renderHtml? }): { documents, index, help, snapshot, diagnostics, ok }
// a request is for one reader (ADR 0029): audience and role a value or a list, read as a set; checkRequest gives a CheckedRequest
// with sorted lists, and every file names them, with the flags, as sorted lists held all-of; the index names its profile first
// renderHtml: true | "page" sets each document's html, "fragment" its htmlFragment (publication §2), renderFragment(markset)
// help is spec/publication.md §5: every published document's tips by explained ID, or null when the request was refused
// snapshot is spec/publication.md §6, the one part that names the commit and graph hash (ADR 0021); snapshotFile(snapshot)
reviewStatus(graph, knowledge), pinHash(kind)   // Core §9 currency over meta.review (ADR 0025); pinHash(undefined) and ("content-v1") are contentHash, ("file-v1") sourceHash, else null

// @intentset/help  (no dependencies; a browser runtime)
readHelp(text | bytes | value): { ok, help, problems }      // refuses a file with any problem, whole
tipFor(help, id); helpForPage(help, ids)                    // one control, or one page: tips, their articles, what has no tip
servedTo(file, reader): boolean                             // ADR 0029: the file's projection cleared, product/release/edition equal, every audience, role and flag held
bindTips(root, help, { attribute?, render? }): { bound, missing }   // data-behavior="BEH-..." by default; data-help-tip + data-help-knowledge, no title
watchTips(root, help, { render?, unrender?, attribute?, MutationObserver?, requestFrame?, cancelFrame? }): { coverage(), dispose() }   // rebinds once per frame; dispose undoes it
```

```ts
// @intentset/markset-adapter
MARKSET_VERSION = "0.4.1"
MARKSET_GUIDE_URL = "https://markset.org/guide.md"   // the agent guide and every syntax remediation point at it
marksetCarrier(path, source): DocumentInput      // same shape as plainCarrier; a test asserts they agree on every example
```
