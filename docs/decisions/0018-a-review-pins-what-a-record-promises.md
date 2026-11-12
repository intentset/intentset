# ADR 0018: A review pins what a record promises, not where it stands

**Status:** accepted, 2026-11-12

## Context

A knowledge review pins a hash of each source it was reviewed against: what the knowledge explains, and the rules
governing each explained behavior (publication §3). Until now each pin was the source's `sourceHash`, the SHA-256 of
the whole file (ADR 0005), so every byte of the record counted, its frontmatter included.

That made a review fragile in exactly the moments that matter. Approving a behavior, marking it implemented, setting
its `delivery` (ADR 0017) or recording its own review all rewrite the file, and every guide that explains it reads
`needs-review` although nothing it explains changed. An adopter that moves its records through the lifecycle in bulk
sends every reviewed guide back to review at once, and again each time. Owners who re-sign out of habit stop reading
what changed, and `needs-review` stops meaning that something did.

The hash should cover what a guide explains, which is the record's promise, and leave out the record's place in its
lifecycle and who reviewed it.

## Decision

**A review record names what its pins hash, in `hash`** (publication §3).

- **`hash: content-v1` pins the content hash.** It is SHA-256 over the canonical JSON (ADR 0005) of `frontmatter`,
  `body` and `ending`:
  - `frontmatter` is the parsed frontmatter without `status`, `delivery`, `reviewedBy`, `reviewedAt` and the
    `intentset.org/review` extension (and `extensions` when nothing else is left in it);
  - `body` is the document after the frontmatter, as written;
  - `ending` is the status when it is `deprecated` or `retired`.

  Everything else that states the promise counts: the title, the body, links, availability and every other field.
  Because the frontmatter is hashed as parsed, key order, quoting and indentation do not count.
- **Without `hash`, a pin is the whole file**, as before. Every review written before this decision has no `hash`, so
  each one means what it meant and stays current until its sources change. Nobody re-signs anything to upgrade, and
  a review moves to `content-v1` the next time someone signs it off.
- **Any other `hash` is a kind the implementation does not read**, so no pin matches and the knowledge needs review.
  A later kind is added the same way, and an older implementation fails closed on it.
- **A record that is going away still makes its guides need review.** `ending` puts `deprecated` and `retired` into
  the content hash, so a source moving to either one moves the pin. Re-signing after that pins the new hash, so a
  guide about a deprecated record can be current again once someone has read it.
- **`sourceHash` does not change.** The export, the graph hash, evidence subjects and drift review keep hashing the
  whole file, where a status change should count.
- Each record carries `contentHash` beside `sourceHash` in core, in `intentset context --json` and in the MCP
  server's context tools, so a script that writes pins can read it.

This replaces the wording in ADR 0005's example, which said a pin is the SHA-256 of the source file: that is now one
of two kinds. No existing case changes its `valid` or `diagnostics`, so `intentset.spec` stays `0.2`, and the export
carries no new member, so it stays `0.5`.

## Options rejected

- **Change what every pin means.** Simpler in code, but every reviewed guide in every adopting repository would read
  `needs-review` on upgrade and need re-signing once, for no change in what it explains.
- **Leave out all of the frontmatter, and hash the body only.** Links and availability are part of the promise: a
  behavior governed by one rule fewer, or offered to another edition, is a different promise.
- **Leave out `status` entirely, retirement included.** A guide explaining a record that is going away would stay
  current, and its readers would not be told.
- **Detect deprecation and retirement with a separate check beside the hash.** A check of the current status alone
  cannot tell a record deprecated since review from one deprecated before it, so either a guide about a deprecated
  record could never be current again, or nobody would be told when its record was deprecated. Putting `ending` in
  the hash records the status the review saw.
- **Hash the file with the excluded lines removed.** A change of quoting or key order would still move it.

## Consequences

- Approving, implementing or releasing a source, or setting its `delivery`, leaves a `content-v1` review current.
  Editing what the source promises, or deprecating or retiring it, still sends the guide to review.
- A tool or script that writes review pins writes `hash: content-v1` and pins each source's `contentHash`.
- The conformance cases pin literal content hashes of the example's sources, so another implementation has to
  compute the same hash, not just one that ignores the same fields.
