# ADR 0022: Approval is a reviewed change to a record, and the tools write it and show it

**Status:** accepted, 2026-11-24

## Context

Approval is the one step the model reserves for a person. An agent writes records beside the code, sets `delivery`
(ADR 0017) and never sets a status past `draft` (Core §10, the agent guide). Core §7 says what `approved` means, an
editorial claim that records intent, and since ADR 0020 a record can say on what basis it was approved. Nothing says
how a record gets there or how anyone sees that it did, and ADR 0020 left writing the approval to "a tool": a
workflow product has one, and a repository that adopts Intentset directly has none.

In practice a person approves by editing `status` in a file. Three things make that worse than it sounds:

- **Nothing writes it.** `intentset list --status draft` finds the queue (ADR 0016), and every other step is the
  adopter's: a script that locates the records, edits their frontmatter, and for knowledge computes and writes the
  review pins of publication §3. Each adopter outside Streamlane writes the same script, and each one gets the
  frontmatter edit or the pins slightly wrong at first.
- **Nothing checks it first.** Approval can make a valid tree invalid: an approved outcome with no measure is
  CORE003, an approved rule with no verification is CORE007 at L3, an approved behavior with no owning slice fails at
  L2. The approver learns that from CI, after the push.
- **Nothing shows it.** `intentset review` reports code that changed while its records did not. A status that moved
  from `draft` to `approved` in the same change is one line in a diff of many files. An agent that approves its own
  record, against the guide, is caught only by a reviewer who reads every frontmatter hunk.

The tools cannot know who is at the keyboard, and should not pretend to. What they can do is write the change
correctly, refuse one that would not validate, and put every approval in a change in front of its reviewer.

## Decision

**Approval is a change to the record, reviewed like any other change.** The record of who approved is the commit and
the pull request that carries it; `approval` (ADR 0020) says who, when and on what basis in the file. Core §7 says
so. Intentset adds no approval state, request or sign-off beside the files.

**`intentset review` lists the approvals in a change.** A new section, "Approvals and status changes", names every
changed record whose `status` or `approval` differs from the base's copy, and every record new since the base that
arrives past `draft` or carrying an approval: its ID and type, the two statuses, and the approval it now states, or
that it states none. An approval rewritten on a record whose status did not move is listed too, since it changes who
the record says approved it. A moved record is compared with the file it was. The base's copy is read as the baseline
comparison already reads one (`fileAt`), and the JSON output carries the same rows as `statusChanges`. With no base
there is nothing to compare and the section says so. It is a report, not a gate: `--fail-on-drift` does not read it,
because who may approve is the repository's workflow (ADR 0020). Core §10 asks a review for the list.

**`intentset approve` writes an approval**, the second command that rewrites records (design invariant 1; `migrate`
is the first).

- **What it selects.** IDs as arguments, or `list`'s selector flags (`spec/list.md` §1), at least one of either: a
  bare `intentset approve` is a usage error, so nobody approves a whole tree by pressing return. Among the matches
  only drafts are changed; a matched record at any other status is named as skipped. An ID that names no record is an
  error and nothing is written.
- **What it writes.** In each draft's frontmatter, `status: approved` and an `approval` block (ADR 0020): `at` from
  `--at` (today when absent), `basis: direct`, and `by` from `--by`, replacing any approval the draft carried. `--by`
  is required: the command does not guess a name from git or the environment. The edit is to those lines of text, as
  `migrate`'s is, so every other byte of the file is as it was. It writes no `reviewedBy` or `reviewedAt` on a record
  that is not knowledge: ADR 0020 keeps those for a knowledge review.
- **Only `direct`.** A person at a command line approving named records has read them, or says so. A `derived`
  approval is written by the tool that holds the source it derives from, and an `attested` one by an agent's own
  workflow; neither is this command's.
- **Knowledge gets its review as well.** An approval is not a review (ADR 0020), and approved knowledge with no
  current review is CORE008 at L4 and is never published, which nobody means by approving it. For a knowledge record
  the command also writes `reviewedBy`, `reviewedAt` and `intentset.org/review` with `hash: content-v1` and each
  source's `contentHash` (publication §3, ADR 0018), the sources being `reviewSources`, the ones `reviewStatus`
  checks. The two statements stay apart in the file; one command writes both because one person made both.
- **It validates first, and writes all or nothing.** The command validates the tree as it is, then again in memory
  with the changes applied (`SessionOptions.overlay`), at the level `validate` would use or `--level`. If the second
  run holds an error the first did not, it prints those diagnostics, writes nothing and exits 1. Errors already
  present do not block: an approval must not make a tree worse, and is not asked to make it clean. Above L2 the
  second run reads source files and run records from disk as they are, so it judges evidence against the tree before
  the approval; CORE007 for a claim that has no current pass is still found, since it reads the claim's new status.
- **It refuses what it cannot edit in place.** A record whose `status` is not on one line of a block-style
  `intentset:` mapping, or whose `extensions` is written inline where a review must go, stops the run with nothing
  written. The command rewrites lines; it does not re-serialize YAML.
- **It refuses a dirty tree** unless `--allow-dirty`, as `migrate` does and for the same reason: the rewrite is a
  diff on its own. `--dry-run` writes nothing, so it does not ask.
- **`--dry-run`** prints what would be written and writes nothing.
- **It stops at the working tree.** No branch, commit or push. How a change reaches review is the repository's own
  process, and the command's output is the diff that process reviews.

**The command authenticates nobody, and the documents say so.** An agent can run it as easily as edit a file. The
guide's "Never" list gains the command by name: an agent runs it only when the person approving says so, with the
name that person gives. What holds the line is what holds every other line in a repository: the pull request, where
"Approvals and status changes" now shows the approval, and whatever the adopter requires of changes under its
records (a code owner, a protected branch).

Design invariant 1 names two exceptions instead of one. Invariant 7's list of read-only commands is unchanged:
`approve` is not in it and `review` stays in it. No existing case changes its `valid` or `diagnostics`, so
`intentset.spec` stays `0.2`; the export carries no new member, so it stays `0.6`.

## Options rejected

- **Document the recipe and build nothing.** It costs a page, and it should be written anyway. It leaves the three
  problems as they are: the script, the late failure and the invisible approval.
- **Only the report.** It answers the worst of the three and writes no file, so invariant 1 stays whole. The adopter
  still writes the frontmatter edit and, for knowledge, the pins, which is the part scripts get wrong.
- **A general `intentset status set <status>`.** Each later status has its own conditions (`released` needs a
  reviewed release snapshot, Core §7), and `delivery` already carries most of what `implemented` was used for
  (ADR 0017). Approval is the transition reserved for a person and the one with a check worth running first. Another
  transition gets its own decision when an adopter asks.
- **Commit, branch or open a pull request.** Every adopter's branch rules, commit conventions and host differ, and a
  tool that commits has to be right about all of them. `git` is already installed.
- **Approval requests, queues and sign-offs kept beside the records.** That is a second source of truth about a
  record's state, and a workflow product. Streamlane is one; the files stay authoritative under it.
- **Refuse to run for an agent**, by environment variable or a missing terminal. The detection is a guess, it reads
  as a guarantee, and editing the file goes around it.
- **Default `--by` to git's `user.name`.** In an agent's session that is the developer's name on an approval
  the developer did not make.
- **Approvals as separate records.** One record per artifact (invariant 1); `approval` exists for this.
- **Write `reviewedBy` and `reviewedAt` on every approved record.** The first draft of this decision did, before
  ADR 0020 was read against it: they are a knowledge review, and a behavior carrying them would look reviewed to
  anything that reads them.
- **Leave knowledge to its own command.** Approving a knowledge record and leaving it unpublishable until a second
  script writes the pins is the script this decision set out to remove.
- **Re-sign an approved knowledge record whose sources changed.** The same lines would be written, but it is a
  review of a record already approved, not an approval, and the command changes only drafts. It waits for an adopter
  who asks.

## Consequences

- An adopter's approval script becomes `intentset list --status draft` to read the queue and `intentset approve` to
  act on it, with the repository's own commit and pull request around them.
- A reviewer sees every approval in a change without reading frontmatter, whoever or whatever wrote it.
- `approval.by` is still a string nobody verifies. A team that needs proof of who approved gets it from its host's
  review rules, not from Intentset.
- Approving a record moves its `sourceHash`, as ADR 0020 says of writing `approval` by any means: the graph hash
  moves, a whole-file review pin needs review, and under subject binding a run record whose subject includes the
  record reads stale until it is run again. A `content-v1` pin is unmoved.
- Not decided here: what happens to an approved record whose promise is edited afterwards. Nothing sends it back to
  `draft`, and nothing says the approval covered the new text. A knowledge review answers that for its sources with
  pins; whether approval should pin its own record the same way is a separate decision.
- The change ships with Core §7 and §10, the agent guide, and BEH-APPROVE and BEH-REVIEW-APPROVALS with their
  verifications in Intentset's own model, as drafts, under the CLI's slice. It adds no conformance case: the suite
  holds what a record means, and neither a command that writes one nor a report about a change is in it.
