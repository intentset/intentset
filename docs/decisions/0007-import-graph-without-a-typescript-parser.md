# ADR 0007: The import graph is built from TypeScript's scanner, because TypeScript 7 has no in-process parser

**Status:** accepted, 2026-10-02

## Context

The VSA checker needs every import edge: static, type-only, dynamic, `require`, and re-exports (profile TS004). The
plan assumed TypeScript's JavaScript API (`createSourceFile`, `parseConfigFileTextToJson`). The repository is on
TypeScript 7, the native port, whose package exports only `{ version }` to JavaScript; the parser runs in the native
binary behind an IPC API. Spawning that binary from `intentset architecture check` would make a read-only check
start a process, against invariant 7, and tie every run to a platform binary.

## Decision

`extract.ts` tokenizes with TypeScript's own scanner, imported from `typescript/unstable/ast/scanner` with
`SyntaxKind` from `typescript/unstable/ast`, makes the two decisions a scanner leaves to its parser (regular
expression versus division, and resuming a template), and recognizes the import shapes over the token stream.
`tsconfig.ts` reads JSON with comments itself and follows `paths`, `baseUrl` and `extends` within the tree. The
`typescript` peer range is `^7.0.2`.

Anything the scanner pass cannot settle (a computed specifier, an unterminated token) is a TS004 warning and an
`unresolved` entry, never a silent pass.

## Consequences

- The subpaths are marked unstable. A TypeScript 7 minor release may move them; the architecture package's tests
  exercise every import shape, so a break shows as failing tests on the upgrade rather than as missed edges.
- A consumer on TypeScript 5 or 6 cannot use this package until a second extractor exists for the classic API. That
  is acceptable for v0.1, since the reference profile names the toolchain and the pilot is on 7; it is the first
  thing to revisit if an adopter asks.
- No second TypeScript grammar is written by hand: tokens come from TypeScript, and only the import recognition is ours.
