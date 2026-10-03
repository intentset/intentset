# ADR 0005: Canonical JSON and SHA-256 for every hash

**Status:** accepted, 2026-10-02

`canonicalJson` serializes with keys sorted recursively and no whitespace. `sourceHash` is SHA-256 of the file bytes.
`graphHash` is SHA-256 of the canonical JSON of the sorted list of `{ id, type, sourceHash, links }` where `links` is
the artifact's authored edges with each target list sorted. Timestamps and commits are outside the hash, so the same
files at two commits have the same graph hash, which is what lets evidence be bound to the graph rather than to a
commit alone (Core §8 binds to both). All of it from `node:crypto`.
