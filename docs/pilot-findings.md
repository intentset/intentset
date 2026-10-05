# Pilot findings

An open register of what real repositories asked of the v0.1 specifications and the reference implementation. Each
entry says what was found, where, and whether it is fixed, decided, or open. An open entry needs a decision from the
specification's owner before the spec changes; the implementation does not change semantics on its own. None is
open now.

The first pilot is Streamlane's blocked state (Streamlane ADR 0033, branch `intentset-pilot`): 26 records, one
slice across `packages/core`, `amplify/` and `apps/web`, eight verification records bound to existing tests.

## Decided by the specification's owner, 2026-10-03

1. **A slice has one entrypoint per package it spans.** `slice.entrypoint` became `slice.entrypoints`, a nonempty
   list; every entry is a public surface, each lies in the slice's own source claims, and two in one package are
   VSA002. A consumer is pointed at the entrypoint in its own package. Streamlane's blocked-work slice had its logic
   in `packages/core` and its UI in `apps/web`; nine web files read as VSA003 under the single-entrypoint rule.
   Rejected: UI as a composition surface, and keeping one entrypoint with the advice to split such slices.
2. **Imports into a slice from outside the declared scope are warnings.** An out-of-scope importer reaching a
   slice's private file is VSA003 (or TS003 for a screen) at severity warning, so a narrow scope no longer hides the
   consumers that reach past a surface; one reaching an entrypoint reports nothing. Rejected: requiring consumers to
   be in scope, and leaving it silent.
3. **Where run evidence lives: an informative note in Core §8.** Keep run records in CI artifacts or another store,
   never in the commit under assessment. Rejected: a normative MUST NOT, and saying nothing.
4. **A draft claim with no verification is a CORE007 warning at L3 and above.** Only a missing definition warns; a
   missing run on a draft is left to the coverage report, and an approved claim is still an error. Rejected: leaving
   drafts silent, and failing L3 on drafts.

## Fixed in the implementation

- **The import extractor looped on JSX text such as `#{n}`** until the heap ran out (Streamlane `Delivery.tsx`).
  TypeScript 7's scanner returns an empty private identifier there without advancing; the extractor now steps over
  a token that does not advance. Commit 2d1a757.
- **Verification claims never matched.** Claims resolved against production files only, so a verification claim
  naming a test read as matching nothing (VSA009). Commit 2d1a757.
- **Asset imports read as unresolved.** `import styles from "./x.module.css"` was a TS004 because the CLI gave the
  checker code files only; the tree now carries every file path, with empty text for non-code files.
- **Markset 0.3.4 rejected a block sequence at its key's indentation**, valid YAML and how every record is written,
  with FRONTMATTER_UNPARSEABLE. Fixed in Markset (commit 3601c8c, unreleased); the adapter drops that one code until
  the pin moves past 0.3.4, and a test removes the workaround with the bump.
- **A slash in JSX text read as an unterminated regular expression**, so three Streamlane files whose JSX holds a
  `/` breadcrumb separator or the help text "Use + - * /" were TS004 warnings, "not checked, so not a pass". The
  extractor lexed JSX as code, where the same mistake could also read `//` in a URL as a comment and drop an import
  later on its line. It now reads an element through its closing tag with the scanner's JSX methods, so text and
  attribute strings are skipped and only expression containers are code; a `<` that does not read as an element,
  such as `<T,>(x: T) => x`, is rescanned as code.
- **TypeScript 7 has no in-process parser.** The import graph comes from TypeScript's scanner (ADR 0007).

## Observed, no change needed

- Five of eight verifications had a current pass at the records' commit: both core unit tests, and the writer's
  blocker tests against DynamoDB Local (9 of 9). The three Playwright checks need a deployed sandbox and read as
  missing, which is the honest answer.
- Two of three rules have no verification: that the blocked fields change in the same transaction as their cause,
  and that a hidden blocker is counted but never named. This is the kind of gap the model exists to show.
- ADR 0030 became the decision record by gaining frontmatter, with its existing Context, Decision and Consequences
  headings satisfying Core §6 unchanged.
