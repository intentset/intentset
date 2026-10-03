# ADR 0006: A conformance case is a mutation of a baseline

**Status:** accepted, 2026-10-02

Thirteen whole files per case would never be reviewed; a patch is. A case in `tests/<section>.json` names a
`baseline` (a directory under `examples/`), then `files` (whole documents, null to delete), `patch` (dotted-path
frontmatter edits and body replacement per file), `registries`, `sources`, `config`, `evidence` and `request`, and
states `valid`, `diagnostics` (a multiset of codes) and optional `artifacts`, `export` and `published` expectations.
`spec/conformance.schema.json` is the schema. `@intentset/conformance-suite` is staged at build time with every patch
applied, so a consumer gets whole files and needs no patch logic.
