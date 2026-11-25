# ADR 0025: A knowledge review is a core field, pins content by default, and is withheld with its source

**Status:** proposed, 2026-11-24 (issues #130 and #49). Not accepted: the decision is the product owner's. Part of the
move to `0.3`, with ADR 0023, ADR 0024 and ADR 0026. Amends [ADR 0018](0018-a-review-pins-what-a-record-promises.md).

## Context

A knowledge record's review is `reviewedBy` and `reviewedAt`, which are core fields, plus the pins of its sources,
which are authored under `extensions.intentset.org/review` (publication §3). Three things about that shape follow from
the order it was built in:

1. **Core reads an extension.** An extension is what Core preserves and never interprets (Core §4). This one decides
   whether knowledge is current, whether it is published, and what `intentset approve` writes.
2. **The default pin is the older one.** A review with no `hash` pins each source's whole file; `content-v1`, which
   leaves out what does not change a promise, has to be named (ADR 0018). `approve` already writes `content-v1`, and
   publication §3 says a review SHOULD pin it.
3. **The export leaks through it** (issue #49). The export withholds a restricted artifact from every list, link and
   report, and exports `extensions` as authored (export §2). A review must pin every rule that governs an explained
   behavior, whatever its visibility, so a customer-visible knowledge record exports a restricted rule's ID and hash
   in an envelope that withheld the rule. A `tips` key does the same. The author cannot avoid the pin: it is required.

The third is a gap in design invariant 4, publication fails closed, and it cannot be closed while the pins are an
extension the export promises not to rewrite.

## Decision

**The review is `intentset.review`, a core block. Its pins are content hashes unless it says otherwise. The export
withholds a pin, and a tip, with the artifact it names.**

```yaml
intentset:
  reviewedBy: a-person
  reviewedAt: 2026-11-24
  review:
    sources:
      BEH-ASMT-SCHEDULE: 6d6d30d8dc13...
      RULE-ASMT-FUTURE: daea07d3681b...
    hash: content-v1          # optional; absent means content-v1
    snapshot: <commit>        # optional, informative
```

- `hash` absent means `content-v1`. The whole-file pin gets a name, `file-v1`. Any other value matches nothing, as
  now.
- `intentset migrate --to 0.3` moves the extension to `review`, and where the extension had no `hash` it writes
  `hash: file-v1`, so no existing review changes what it pins and none goes to `needs-review` by migrating.
- `extensions.intentset.org/review` on a `0.3` record is CORE001: left alone it would read as no review, and a review
  that silently stops counting should be said.
- `review` is on knowledge only, and is left out of a record's content hash, as the extension was.
- **Export.** `review` is exported as a field. A pin whose source is withheld is left out and counted in the
  artifact's `withheldLinks`; so is a `tips` entry whose key is withheld. `help.json` is unchanged: its key is the
  explained ID whatever its visibility, by design (ADR 0011).
- Whether knowledge is current stays the producer's judgment, in `reports.knowledge`. An export with a pin withheld
  cannot be used to recompute it, and `withheldLinks` says a pin is missing.

## Rejected

- **Keep the extension and special-case it in the export.** The export would rewrite one extension while saying it
  exports extensions as authored.
- **Redact the key and export the hash.** A whole-file hash of a restricted record confirms a guess at its contents.
- **Flip the default without naming the old kind.** Every review written before ADR 0018 would change meaning on
  upgrade, and either go to `needs-review` at once or be read against a hash it never held.
- **Move `reviewedBy` and `reviewedAt` inside `review` too.** Tidier, and it changes two more fields in every reviewed
  record for no check that needs it.

## Consequences

- **Breaking**: a record that conformed with the extension no longer does, so this moves `intentset.spec` to `0.3`,
  and the export to `0.7`, whose artifacts gain `review`.
- In this repository: one example record, four source files that read the extension (core, the publisher twice, the
  CLI), and the 23 consumer fixtures, which are generated.
- The two tests that today assert a restricted ID appears nowhere but the review pins, with a comment pointing at
  issue #49, assert it appears nowhere.
- `approve` writes the core block and no `hash`.
