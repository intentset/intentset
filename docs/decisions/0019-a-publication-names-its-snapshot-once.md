# ADR 0019: A publication names its snapshot once, not in every document

**Status:** accepted, 2026-11-14

## Context

A publication is the documents `intentset publish` writes for one projection, plus `help.json`, `index.json` and
`chunks.jsonl` (publication §2, §5). Until now every generated document carried `snapshot`, the commit and graph hash
it was published from, in its `intentset-publication` block. So did its HTML rendering's
`<meta name="intentset-publication">` and each of its retrieval chunks, which carry the block unchanged.

The graph hash covers every record in the model (ADR 0005). Any change to any record moves it, and the commit moves
with every commit. So every published file changed every time a record did, even when nothing that file says had
changed.

An adopter commits its published help to the repository, as the product's in-app help and its public site's help
section: several projections and about 850 files. Two pull requests that each change a record then conflict on every
one of those files. Each time, the fix was to take main's copy and publish again, three times on one pull request in
one day. The adopter's own currency check already left `snapshot.commit` and `snapshot.graphHash` out of its
comparison, because they say where a publication came from and are not part of what any document says.

Core §9 listed the snapshot ID among the provenance "each published knowledge document" must retain. It does not need
to be in each document. A document still pins exactly what it was made from: the knowledge's `sourceHash`, and the
`id`, `revision` and `sourceHash` of every explained source the projection admits. Those change only when that
document's own sources change. The snapshot says which state of the whole model the run read, and that is the same
for every document in the run.

## Decision

**A generated document no longer carries `snapshot`. A publication names its snapshot once, in the files written once
per run** (publication §2, §5; Core §9).

- The `intentset-publication` block drops `snapshot`. Every other field stays, in the same order: `source` with its
  `sourceHash`, `sources` with theirs, `withheldSources`, `audience`, `availability`, `reviewer`, `reviewedAt`,
  `publishedAt`. The HTML `<meta>` and the retrieval chunks carry the block unchanged, so they drop it too.
- `help.json` keeps `snapshot` (`commit`, null when unavailable, and `graphHash`), and is now where the specification
  requires it: it is written whenever a request is accepted, beside the documents. The publisher's index keeps its
  `snapshot` too. It is the run's other per-publication file, and customer tools read and cite the snapshot from
  it (Core §10).
- `commit` stays beside `graphHash`. The graph hash moves whenever the commit does, so dropping `commit` would remove
  no conflict, and the commit is what a person can follow.
- The request is still refused (PUB001) when its snapshot's graph hash is not the graph's, so the snapshot a
  publication names is still exact.
- The profile stays `intentset/publication/0.2`, and `intentset.spec` stays `0.2`. No conformance case checked the
  per-document snapshot, so none changes its `valid` or `diagnostics` (Core §1). Core §1's table gains a row for it,
  because a reader of a generated document now sees a field fewer.

## Options rejected

- **Leave the specification alone and strip the fields in the adopter's tooling.** The adopter would no longer write
  byte for byte what `intentset publish` writes, and every other adopter that commits its help would meet the same
  conflicts.
- **Keep the snapshot per document but make it optional.** Publishers would differ on whether a document carries it,
  and the reference implementation would have to pick one anyway. A field nobody can rely on is noise.
- **Move the snapshot into a new manifest file.** `help.json` is already written once per accepted request and
  already carries the snapshot. A new file would add a third place to keep in step.
- **Drop the snapshot from the index too, leaving `help.json` as the only place.** Customer tools read the index, and
  the MCP server's customer mode cites the snapshot from it. One more file per projection is a conflict that
  publishing again resolves.
- **Drop `commit`.** It removes no conflict and loses the readable pointer.
- **Drop the per-document `sourceHash` and `sources` too.** They move only when that document's sources move, so they
  are content, not churn. They are also how a reader of one document, without the rest of the run, can tell exactly
  what it was made from.
- **Move the publication profile to `intentset/publication/0.3`, or `intentset.spec` to `0.3`.** Every profile ID
  ends in the specification version, and Core §1 decides what kind of change this is from the conformance suite.
  Removing a field no case checks is not a breaking change there. Moving `intentset.spec` would make every adopter
  migrate its records for a field in generated output.

## Consequences

- A published document's bytes change only when its knowledge, an explained source the projection admits, the
  request or `publishedAt` changes. A record change elsewhere in the model changes only `help.json` and the index,
  one each per projection. Publishing again resolves a conflict on them.
- A document read away from its run no longer says which commit it came from. Its source hashes still identify what
  it was made from, and the run's `help.json` names the snapshot.
- `PublicationMeta` in `@intentset/publisher` loses `snapshot`, which is a change to its API, so the packages take a
  minor version. A reader of a generated document that read `snapshot` reads it from `help.json` or the index instead.
  The MCP server's customer mode now cites the index's snapshot for every passage and document. It used to check that
  each document's snapshot matched the index; that check is gone because the field is.
- A conformance case asserts that a published document carries no snapshot, and that `help.json` does.
