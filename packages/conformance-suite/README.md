# @intentset/conformance-suite

The Intentset conformance cases, as data. This package contains no validator, no graph and no opinion about how an
implementation is built. It is what an implementation is *checked against*.

If you are writing an Intentset implementation, in any language, this is the only thing you need from the reference
implementation.

## What is in it

| Path | What |
|---|---|
| `cases/*.json` | One file per section: `core`, `export`, `vsa`, `evidence`, `publication`. Each file is an array of cases. |
| `schemas/conformance.schema.json` | The normative schema every case file satisfies. |
| `schemas/frontmatter.schema.json` | The structural schema of a document's frontmatter (Core §3, §4). |
| `schemas/export.schema.json` | The schema of the `intentset/export/0.3` envelope. |
| `schemas/evidence.schema.json` | The schema of run records (Core §8). |
| `consumer/` | Export envelopes a consumer must accept or reject, and `manifest.json` saying which and why. |
| `examples/scheduling/` | The worked example the cases are built from, for reading alongside them. |

The JSON is the artifact. Read it off disk in whatever language you are working in:

```
node_modules/@intentset/conformance-suite/cases/core.json
```

For JavaScript there is also a small loader, which is a convenience rather than the format:

```js
import { loadSuite, schemaPaths, suitePath } from "@intentset/conformance-suite";

for (const [section, cases] of Object.entries(loadSuite())) {
  for (const c of cases) {
    const result = yourImplementation(c.files, { level: c.level });
    // compare against c.valid, c.diagnostics, c.artifacts, c.export, c.published
  }
}
```

## A case

```json
{
  "section": "core",
  "name": "C03 governedBy targets a capability",
  "files": {
    "BEH-ASMT-SCHEDULE.md": "---\nmarkset: 0\nintentset:\n  ...\n---\n\n# Schedule a student assessment\n...",
    "CAP-ASMT-ASSIGN.md": "...",
    "registries.yaml": "owners:\n- team-assessment\n..."
  },
  "level": "L1",
  "valid": false,
  "diagnostics": ["CORE003"]
}
```

Every case is **expanded**. In the reference repository a case is written as a mutation of a baseline (a patch to one
frontmatter key of one example document), because a patch can be reviewed and thirteen whole files cannot. This
package is staged from those at build time with every patch applied, so what you get is a repository tree and you
need no patch logic:

- `files` is the whole tree by repository-relative path: every document, plus `registries.yaml` and
  `.intentset/config.yaml` when the case has them. Treat it as the repository.
- `sources` holds non-document files (TypeScript sources, a `tsconfig.json`, test output) for the VSA and evidence
  sections.
- `level` is the conformance level to validate at. Checks above it must not run, and must not report.
- `carrier`, when present, is `markset`: read the documents with a Markset parser and pass its diagnostics through with
  origin `syntax` and Markset's own codes (`COLUMNS_SINGLE`, not AREA###). Absent means `plain`: frontmatter and headings
  only, and no diagnostic of the reader's own.
- `evidence` carries run records (Core §8) and `request` a publication request, for the sections that need them.

## What you must match

- `valid`: false when at least one diagnostic is an error.
- `diagnostics`: every code, errors and warnings alike, as a **multiset** in any order. Absent means none are
  permitted. Messages, locations and remediation text are yours to write; codes are Core §11 and the VSA and
  profile specifications, and are stable within v0.1. A `markset` case's syntax codes are Markset's own.
- `artifacts`, when present: the IDs in the graph, compared sorted.
- `export`, when present: a deep partial match against your envelope. Only the fields named are compared, so
  `generatedAt`, `source.commit` and `graphHash` are checked only by a case that names them. Where a case names
  `graphHash` it was computed per ADR 0005: SHA-256 of the canonical JSON (keys sorted, no whitespace) of the sorted
  list of `{ id, type, sourceHash, links }`.
- `published`, when present: the knowledge IDs that must be published, and text that must not appear anywhere in
  the output. The second half is Core §9's rule that an excluded source's title and path never leak.

An aspect a case does not state is not judged. A section your implementation does not yet cover should be reported
as skipped, not passed: a closed vocabulary of checks is only worth having when a report says which ones ran.

## Testing a consumer of the export

`consumer/` is for tools that import an export rather than produce one (spec/export.md §6). `manifest.json` lists
each case: the envelope's `file`, the `connection` it is read against, and `expect`. An accepted case gives the
snapshot pair, the validation status, the reports supplied, the withheld count and each verification's evidence
status; a rejected one gives the category (`not-json`, `unsupported-contract`, `malformed`, `identity-mismatch`,
`mixed-snapshot`, `forbidden-content`, `inconsistent-report`). Every rejected envelope is an accepted one with one
deliberate defect, and several are schema-valid: a schema validator alone is not a consumer.

```js
import { loadConsumerFixtures } from "@intentset/conformance-suite";

const fixtures = loadConsumerFixtures();
for (const c of fixtures.cases) {
  const outcome = yourImporter(fixtures.read(c.file), c.connection);
  // accepted when c.expect.accept, otherwise rejected with c.expect.category, and the prior snapshot kept
}
```

## Where the rules are

The Core specification defines the carrier, the fields, the relationships, the required sections and the diagnostic
codes; the Traceable VSA specification and the TypeScript/Amplify profile define the architecture checks. Both are at
<https://intentset.org/>.

The canonical copy of these cases is `tests/` in the [Intentset repository](https://github.com/intentset/intentset),
and a test there fails if this package's copy differs from what expansion produces.

MIT.
