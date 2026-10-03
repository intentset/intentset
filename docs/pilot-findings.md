# Pilot findings

An open register of what real repositories asked of the v0.1 specifications and the reference implementation. Each
entry says what was found, where, and whether it is fixed, decided, or open. Open entries need a decision from the
specification's owner before the spec changes; the implementation does not change semantics on its own.

The first pilot is Streamlane's blocked state (Streamlane ADR 0033, branch `intentset-pilot`): 26 records, one
slice across `packages/core`, `amplify/` and `apps/web`, eight verification records bound to existing tests.

## Open: decisions for the specification

1. **A slice that spans packages has more than one public surface.** VSA002 gives a slice one declared contract
   surface, and the profile makes it one `entrypoint`. Streamlane's blocked-work slice has its logic in
   `packages/core` and its UI in `apps/web`; with the web app in the architecture scope, nine files import
   `components/Blocked.tsx` or `lib/blocked.ts` directly and are reported as VSA003 private-file imports, plus four
   TS006 (the `@/*` alias opening them). Options: (a) `entrypoints`, one per package or deployment unit, each a
   public surface; (b) UI components as a composition surface (VSA §6 already lets composition import screens by a
   named exemption; this would generalise it to declared UI exports); (c) the current rule, with the advice that such
   a slice is two slices joined by a contract. (a) is the smallest change and matches how monorepos publish.
2. **Declared scope hides consumers.** With the architecture scope set to the slice's own files, imports *into* the
   slice from outside the scope are not checked, so finding 1 is invisible until the scope is widened. Options:
   report edges into an in-scope slice from out-of-scope files as warnings, or say in VSA §9 that a scope must include
   a slice's consumers to claim VSA003 conformance.
3. **Where run evidence lives.** Core §8 counts a pass only at the assessed commit and graph hash, so a run record
   committed to the repository is stale the moment it is committed. The spec says evidence stores are the adopter's
   to control but not that they cannot be the repository. An informative note in §8 (CI artifacts or an external
   store; never the commit under assessment) would save every adopter discovering it.
4. **Draft records make every level above L1 say nothing.** The pilot's records are draft because an agent wrote
   them (Core §10 forbids self-approval), and CORE006, CORE007 and CORE008 bind non-draft records only, so the L3 run
   reports no diagnostic while two rules have no verification at all. The coverage report shows it; the diagnostics
   do not. Option: a warning-level counterpart of CORE007 for drafts at L3, so a draft gap is visible in CI output.

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
- **TypeScript 7 has no in-process parser.** The import graph comes from TypeScript's scanner (ADR 0007).

## Observed, no change needed

- Five of eight verifications had a current pass at the records' commit: both core unit tests, and the writer's
  blocker tests against DynamoDB Local (9 of 9). The three Playwright checks need a deployed sandbox and read as
  missing, which is the honest answer.
- Two of three rules have no verification: that the blocked fields change in the same transaction as their cause,
  and that a hidden blocker is counted but never named. This is the kind of gap the model exists to show.
- ADR 0030 became the decision record by gaining frontmatter, with its existing Context, Decision and Consequences
  headings satisfying Core §6 unchanged.
