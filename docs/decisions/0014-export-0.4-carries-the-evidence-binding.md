# ADR 0014: Export 0.4 carries the evidence binding, and the specifications move to 0.2

**Status:** accepted, 2026-10-14 (Gary decided both parts on this date, after ADR 0013's stage 2 shipped).

## Context

ADR 0013 made run evidence current for what it checks: by default a record is bound to its verification's subject and
stays current while that is unchanged, and a repository or a gate that needs "tested at this commit" asks for commit
binding. Stage 2 built it and left two things open on purpose.

**The export could not say it.** Export 0.3 states a status at the snapshot's commit and graph hash, its reader rejects a
`current-*` status whose latest record is not at that snapshot, and its record schema is closed. So `graph` classified the
evidence report by commit whenever the repository judged by subject, said so in every `note`, and left out the binding,
the subject hash and `exercises`. A consumer read `stale` for a record the repository's own L3 gate accepted, which is
the opposite of what the export is for: the producer owns the status of evidence and the consumer displays it without
reinterpreting it (export §4).

**The specifications meant two things.** A record bound to a commit, which is every record written before ADR 0013, is
current under one reading and stale under the other, and a repository with slices reads stale until its runs are
imported again. Core §1 says the next breaking change moves `intentset.spec` from `0.1` to `0.2`, and the cases that test
the commit rule were rewritten to name it so that none changed its `valid` or `diagnostics`; what an existing record
means, though, changed.

## Decision

1. **Export 0.4 carries the binding** (`intentset/export/0.4`). The evidence report says which binding is in force and
   why (`binding`, `bindingReason`: `configured`, `default` or `no-slices`, the last being the EVID004 fallback); each
   verification carries the binding that judged it and its `subject`, the SHA-256 of its subject at the snapshot, so a
   reader checks a record against it without recomputing; `latest` is the whole run record, `binding` and `subjectHash`
   included; the `note` of a stale subject record names the part that moved; and a verification artifact carries
   `exercises`. The producer states the repository's own verdict and no longer classifies by commit. A reader's rule for a
   current status is per binding: commit binding as before, subject binding needs `binding: subject` and a `subjectHash`
   equal to the verification's `subject`.
2. **The version moves, not the meaning of 0.3.** Each addition is a member a 0.3 reader's closed schema rejects or a
   status its rule would call inconsistent, which is export §7's test, and a 0.4 reader cannot tell a 0.3 report
   classified by commit from a 0.4 one, so it rejects a 0.3 envelope as `unsupported-contract` with the version it
   supports in the message. The envelope's `spec` moves to `0.2` with Core's.
3. **The specifications move to `0.2`** exactly as Core §1 describes: `intentset.spec` is `0.2`, `profile` is
   `intentset/<type>/0.2` (Core §4 makes the profile's version the spec's), the five specifications' `id`, title and
   revision say 0.2, and a reader of `0.2` rejects a record that declares `0.1`. Core §1 states no migration and none is
   invented: it says records declare the new value. Because every record carries the old value, `intentset migrate --to
   0.2` rewrites those two lines and nothing else.

## Why a command and not a tolerant reader

A reader that accepted both would have to say what a `0.1` record means: under subject binding a record with no
`binding` is a commit record, and that is the very ambiguity the move removes. Core §1 says documents declare the new
value, and the reader already rejects any other, so rejection is the specified behavior. The cost is a mechanical edit of
every adopting repository, which is why the command exists. It refuses a tree with uncommitted changes to tracked files
unless told otherwise, so the rewrite is a diff of its own, and it is the one command that rewrites records (the rule
"tools never rewrite a record" names it as the exception).

## What each consumer does

The same as ADR 0008 and ADR 0012 listed, once more, because each pin moves:

- **Producers of the export** upgrade `@intentset/cli` and run `intentset migrate --to 0.2` once; `model:export` then
  writes 0.4. Nothing else in the command line changes.
- **Readers** (`readExport` from `@intentset/core`, or the consumer's own) change the contract they support to
  `intentset/export/0.4` and drop 0.3, which they reject. A reader of its own must: accept `binding`, `bindingReason`,
  `subject`, `exercises` and the record's `binding` and `subjectHash`; use the per-binding rule of export §4.1 and §5; show
  the binding beside a status; and run the importer over the new fixtures (`subject-current.json`, `subject-stale.json`,
  `commit-fallback.json`, `subject-hash-mismatch.json`, `unsupported-contract-0.3.json`).
- **What a consumer sees change:** a verification the repository accepts by subject now reads `current-pass` in the
  export, where 0.3 showed `stale`, and a stale one says which part moved.

## Consequences

- The conformance suite's `export` section gains cases for a subject report that reads current, one stale that names the
  part that moved, a commit-binding report and a fallback report; `tests/consumer/` gains the accepted and rejected
  fixtures above and its baseline graph hash moved with the records' bytes.
- Every record's `sourceHash` changed with its `spec` line, so every graph hash moved, every pinned review of the worked
  example's knowledge was re-pinned, and the subject hashes pinned by the evidence cases moved with them.
- A withheld artifact's ID can appear in a note (a slice that moved), so the export redacts withheld IDs and source paths
  from notes as it does from diagnostics, and an `exercises` list drops them and counts them in `withheldLinks`.
- The release that carries this is 0.7.0. Export 0.4 and specifications 0.2 are breaking for a consumer that pins 0.3 or
  `0.1`; the CHANGELOG says what each does.
