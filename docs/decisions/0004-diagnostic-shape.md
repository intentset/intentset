# ADR 0004: One diagnostic shape, sorted one way

**Status:** accepted, 2026-10-02

Every package reports `Diagnostic` from `@intentset/core`: `code`, `severity`, `origin` (syntax, profile, graph,
architecture, evidence, publication, render), `artifact` (ID or null), `path`, `location` (line and column only when
known, never invented), `field` (JSON pointer into frontmatter), `message`, `remediation`. Ordering is
`compareDiagnostics`: path, artifact, code, line, column, field, message. Exit codes are 0 pass, 1 validation failure,
2 invocation or tool failure. JSON reports keep warnings in the same list, distinguished by severity, and the summary
counts errors and warnings separately.
