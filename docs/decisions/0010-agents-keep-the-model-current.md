# ADR 0010: Agents keep the model current, and review shows where they did not

**Status:** accepted, 2026-10-04

## Context

Intentset records are not meant to be written by hand. Coding agents write most of the code now, faster than anyone
reads it, and the records are the part of a change a person can still review: thirty lines of behavior in product
language where the code diff runs to thousands. That only holds if the agents keep the records true as they change the
code. Core §10 already said they SHOULD: load the owning slice before editing, update affected semantics and checks
in the same review, never self-approve. Nothing in the toolchain helped them do it or showed when they had not:
`init` wrote no instructions for an agent, `context` took only an ID that an agent about to edit a file does not know,
and `review` mapped changed files to behaviors without noticing that a slice's code had changed and its records had not.

## Decision

Three additions to the CLI, and one paragraph in Core §10.

- **The agent guide.** `init` writes `.intentset/agents.md`: what to load before changing code, what to update when
  behavior changes, how to say it did not, what never to do (approve, publish, change IDs, invent registry values,
  commit evidence), what to run before finishing, and the record format with a behavior template and every type's
  required sections. It is generated from the toolchain, so its commands, sections and trailer cannot disagree with
  it; a test validates its template. `init --agents` writes it alone, for a repository initialized before it existed.
  `init` never edits a file it did not create, so it prints the one line to add to CLAUDE.md (`@.intentset/agents.md`)
  or AGENTS.md rather than adding it.
- **Context by file.** `context <path>` reads the context of the slice whose claims include the file.
- **Drift in review.** `review` lists each slice whose implementation changed since the base while none of the records
  describing it did (Core §10 defines both sets). A refactor changes code and no behavior, so the list is a prompt
  rather than an error. A commit answers it with an `Intentset-Unchanged: <slice ID>` trailer, which the reviewer reads
  in the commit, so the claim that nothing changed is made where it can be questioned. `--fail-on-drift` exits 1 for any
  slice no commit acknowledged, which is the gate a repository puts in CI.

## Consequences

- Test files under a slice's source claim are implementation, so a change to a test alone is listed. That is
  deliberate: a behavior change whose test was updated to match, and whose records were not, is the drift that matters
  most.
- Knowledge is not among the records describing a slice. It explains the model to an audience, and review pins already
  mark it for review when the model changes.
- Acknowledgement comes only from commits, so uncommitted drift is always open. The trailer names slice IDs; a typo
  acknowledges nothing and the slice stays listed.
- The MCP server's context still takes IDs only. Path matching lives in the CLI and the architecture package, and a
  third copy waits for a reason.
