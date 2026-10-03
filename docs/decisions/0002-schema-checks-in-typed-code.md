# ADR 0002: Schema checks are typed code; the JSON Schema is normative and cross-checked

**Status:** accepted, 2026-10-02

## Context

`spec/frontmatter.schema.json` is the shape a second implementation validates against. The reference implementation
could run it through a JSON Schema engine, which adds a dependency and yields messages without remediation or stable
codes.

## Decision

`readArtifact` checks the same constraints in typed code: required fields, enumerations, the ID pattern, no unknown
keys, per-type `profile` and required type-specific objects. A test loads the JSON Schema with a small evaluator (the
subset the schema uses: type, enum, const, pattern, required, additionalProperties, items, uniqueItems, minItems,
minLength, propertyNames, if/then, allOf) and asserts that for every fixture and example the two agree on validity.

## Consequences

Diagnostics carry a field pointer and a remediation. The schema cannot drift from the code without a test failing.
