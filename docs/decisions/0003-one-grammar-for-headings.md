# ADR 0003: Headings come from a Markdown parser, through one input shape

**Status:** accepted, 2026-10-02

## Context

Core §6 requires a level-one heading matching the title and type-specific level-two sections. A regex over the body
would count `#` lines inside code fences as headings.

## Decision

Core defines `DocumentInput` (path, source, raw frontmatter and its line, headings outside fences, syntax diagnostics).
`@intentset/markset-adapter` produces it from the Markset AST. Core's `plainCarrier` produces the same shape from
the text alone, tracking fences itself, for the plain-Markdown fallback Core §9 requires. A test runs both over every
example and fixture document and asserts identical output, so neither can drift.

## Consequences

Core never imports Markset. Markset diagnostics arrive with `origin: "syntax"` and are never confused with semantic
ones. A second carrier (for instance a renderer-less CI step) is a function returning `DocumentInput`.
