# ADR 0031: A generated format has a version of its own

**Status:** accepted, 2026-11-27 (the maintainers' decision 14 on issue #158). It undoes part of the move to `0.4`
before any release carried it.

## Context

Intentset writes several formats for other tools to read. Each names a version in a `profile` or `contract` member, and
its reader refuses any other: the help file, the publication index, the generated document's block, the snapshot file,
the Atlas page's block, the export envelope and the list result.

At each move of `intentset.spec` the first five were moved with it, by habit: to `0.2` on 2026-10-14 and to `0.3` on
2026-11-25. The move to `0.3` happened to change the help file and the index for real (ADR 0027 to ADR 0029), so the
habit cost nothing then.

The move to `0.4` changed one diagnostic code (ADR 0030). No member of any of the five changed. Moving them anyway
would have made `readHelp` refuse every help file in the field, so every product that shows in-app help would have had
to publish again and ship a new reader in step, for a renamed architecture code that no help file mentions.

## Decision

**A generated format's version moves only when what its reader must accept changes, and never because
`intentset.spec` moved.**

A change moves a format's version when a reader built for the current one would be wrong to accept the result as it
stands: a member added that a closed reader refuses, a member removed or renamed, a member given another meaning, or a
value the reader is required to check.

Applied to the move to `0.4`:

| Format | Version | Why |
|---|---|---|
| Help file, `intentset/help` | stays `0.3` | No member changed |
| Publication index, `intentset/publication-index` | stays `0.3` | No member changed |
| Generated document's block, `intentset/publication` | stays `0.3` | No member changed |
| Snapshot file, `intentset/snapshot` | stays `0.3` | No member changed |
| Atlas page's block, `intentset/atlas` | stays `0.3` | No member changed |
| List result, `intentset/list` | stays `0.1` | It never moved with the specifications |
| Export envelope, `intentset/export` | `0.8` | It carries `spec` and each artifact's `profile`, and its reader checks both, so a `0.7` reader refuses the envelope a `0.4` repository writes. That is a change to the format |

The publication profile is the specification of four of these formats, and its own version is theirs: it stays `0.3`.

**What is not a generated format.** A record's `profile` (`intentset/behavior/0.4`) is authored, and Core §4 requires
it to agree with `spec`; it moves with the specifications by definition. The IDs of the shipped architecture profiles
(`intentset/typescript/1`) have versions of their own too, by the amendment under Consequences.

## Rejected

- **Keep moving every format with the specifications.** One number to remember, and every reader in the field breaks
  at every move, whether or not anything it reads changed.
- **Take `spec` out of the export so it need not move either.** A consumer of the export reads the model, and what a
  status or a code means depends on the specification version. It needs the value, so the format carries it.

## Consequences

- A product that reads `help.json` upgrades its reader when the help file changes, and at no other time.
- The versions no longer line up: a repository at `0.4` publishes `help/0.3`. Core §1 and the publication profile say
  so where each version is stated.
- `intentset migrate` never touched a generated file and still does not.
- A test holds each format's version to the value its specification states, so none moves by a search and replace.
- **Amended 2026-11-27 (the maintainers' decision 18): a shipped architecture profile's version is its own too.** The
  IDs a repository's profile file names in `extends` are `intentset/typescript/1`,
  `intentset/typescript-amplify-gen2/1` and `intentset/typescript-nextjs/1`, and each moves only when its profile
  changes what it checks or how a tree must be laid out. The form is a whole number, where the generated formats
  use `0.x`, because `intentset/typescript-amplify-gen2/0.1` to `0.4` are already the IDs of the reference profile's
  specification document at each version of the specifications: a profile at `0.x` would be the same identifier as
  a document, meaning something else. The document keeps its `id`, which carries the specifications' version as every
  specification's does, and says which profile it specifies. No release ever shipped a profile under a `0.3` or
  `0.4` ID (the profile contract was first merged on 2026-11-27 and is unreleased), so `intentset migrate` rewrites
  no `extends`, and the rewrite the move to `0.4` briefly had is removed.
