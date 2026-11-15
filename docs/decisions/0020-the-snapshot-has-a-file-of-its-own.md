# ADR 0020: A publication's snapshot has a file of its own

**Status:** accepted, 2026-11-15. Amends [ADR 0019](0019-a-publication-names-its-snapshot-once.md).

## Context

ADR 0019 took `snapshot`, the commit and graph hash a publication was made from, out of every generated document,
and left it in the two files written once per projection: `help.json` and the publisher's index. It rejected a file
of its own because `help.json` already carried the snapshot, and rejected dropping it from the index because customer
tools cite it from there. Its consequence for an adopter that commits its output was stated as acceptable: "one each
per projection", and "publishing again resolves a conflict on them".

Measured on that adopter after 0.14.0, publishing an unchanged model at a new commit changed exactly ten files, the
`help.json` and `index.json` of each of five projections, two lines each. That is far fewer than 853, and it is still
the same defect:

- Both values move with every commit that changes a record. So every publication rewrites every `help.json` and
  `index.json`, whatever they say, and two branches that each publish conflict on all of them. The adopter still
  needs tooling of its own that keeps a committed file when it differs only in its snapshot, and so still does not
  commit byte for byte what `intentset publish` writes, which is what ADR 0019 set out to end.
- `commit` names the commit checked out when the command ran. Output committed to the same repository is in a later
  commit, so for that use the value can never name the commit that contains it.
- `help.json` is read by a product at runtime. Its bytes changing on every commit changes a deployed asset, and its
  cache key, when no tip did.

ADR 0019's two reasons do not hold up as requirements. The MCP server's customer mode is handed a publication in
memory by the CLI; it reads the index object, not `index.json`, and can be handed the snapshot beside it. Nothing in
this repository reads the snapshot out of `help.json`: `@intentset/help` only checked that it was there. Core §10
requires that context results identify the snapshot, and they still do.

## Decision

**A publication names its snapshot in `snapshot.json`, beside the documents, and in no other file** (publication §6;
Core §9).

- `snapshot.json` is `{ profile: "intentset/snapshot/0.2", derived: true, commit, graphHash }`, `commit` null when
  unavailable. It carries nothing of the request, so every projection published from one snapshot writes the same
  bytes, and an adopter with several projections can keep one copy.
- `help.json` and the index lose `snapshot`. With the documents, their HTML and the chunks (ADR 0019), every file of
  a publication except `snapshot.json` is now the same bytes for the same knowledge, request and `publishedAt`, at
  any commit. A test publishes at two commits and compares.
- It sits in the publication's own directory, one per projection, because `intentset publish` writes one projection
  into one new or empty directory and nowhere else. A file shared by several projections would be written outside
  that directory, by a command that does not know the others exist.
- **`intentset publish --no-snapshot` leaves the file out**, and the publication is complete without it. The file is
  written by default: a publication that says nothing of where it came from should be something a person asked for.
- **What a consumer that commits its output does: not commit the file.** Publish with `--no-snapshot`, or ignore
  `snapshot.json` in version control. Its `commit` cannot name the commit that contains the output, and it differs
  on every branch that changed a record, so committing it brings back one conflict per projection for a value git
  already records better. A consumer that deploys the output, or hands it to another system, keeps the file: nothing
  else says which state of the model the documents were made from.
- The request is still refused (PUB001) when its snapshot's graph hash is not the graph's.
- `readHelp` in `@intentset/help` accepts a help file with or without `snapshot`, so a file written by 0.14.0 still
  reads, and publication §5 requires that of any reader.
- **No profile or specification version moves.** `intentset/publication/0.2` and `intentset/help/0.2` stay, and
  `intentset.spec` stays `0.2`: every profile ID ends in the specification version, and Core §1 decides what kind of
  change this is from the suite. One publication case's `published` expectation moves, from "the help file names the
  snapshot" to "the snapshot file names it, and the help file and index do not"; no case changes its `valid` or
  `diagnostics`. Core §1's table gains a row, because a reader of `help.json` or the index sees a field fewer. The
  new file's profile is `intentset/snapshot/0.2`.

## Options rejected

- **Leave 0.14.0 as it is.** Ten files rewritten per commit instead of 853 is the same conflict, less often noticed,
  and the adopter's workaround stays.
- **Keep `snapshot` in the files but make it optional, or drop it under a flag.** The files would have two shapes,
  and every reader would handle both for good. Leaving a whole file out is a shape every reader already handles: the
  file is not there.
- **Drop `commit` and keep `graphHash`.** The graph hash moves with any record, which is the churn.
- **Replace the snapshot with a hash of what the publication contains.** That would be stable, and it is not a
  snapshot: it cannot be followed back to a commit. The documents already pin their sources' hashes.
- **Write one file for a whole run, above the projections' directories.** `publish` writes one projection into one
  directory, and the adopter's run is a script that calls it five times. Because the file names no request, the five
  copies are identical, and that script can keep one.
- **Not write the file unless asked (`--snapshot`).** Deployed publications would lose provenance by default, and
  Core §9 asks a publication to name its snapshot. The consumer that should omit it is the one committing output,
  and that consumer has a script to put the flag in.
- **Move `intentset.spec` to `0.3`, or the help profile to `0.3`.** Every adopter would migrate every record for a
  field in generated output, the cost ADR 0019 also refused. The price of not moving is stated below.

## Consequences

- Publishing the same model at two commits writes byte-identical documents, HTML, `chunks.jsonl`, `index.json` and
  `help.json`. A consumer that commits its output with `--no-snapshot` sees a diff only when what it publishes
  changed, and needs no tooling to keep it so.
- **`@intentset/help` 0.14.0 and earlier refuse a help file written by 0.15.0**, because they require `snapshot`. A
  product updates `@intentset/help` before, or together with, the publisher. `readHelp` refuses a file whole and the
  product keeps the one it holds, so the failure is tips that do not update, not a broken page. Another
  implementation's help reader meets the same change, and publication §5 now says a reader accepts both.
- A reader that took the snapshot from `help.json` or `index.json` reads `snapshot.json`, and finds none where the
  publisher was told to leave it out. Whether such a publication's provenance matters is that consumer's decision.
- `@intentset/publisher`: `HelpFile`, `HelpOptions` and `PublicationIndex` lose `snapshot`; `PublishResult` gains
  `snapshot`, a `SnapshotFile`, with `snapshotFile`, `SNAPSHOT_FILE` and `SNAPSHOT_PROFILE`. `@intentset/mcp`:
  `CustomerPublication` requires `snapshot`, and customer results keep their shape. The packages take a minor
  version, 0.15.0.
- ADR 0019 stands for the documents, their HTML and their chunks. Its statements that `help.json` and the index keep
  the snapshot are replaced by this one.
