---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/behavior/0.1
  id: BEH-QUESTIONS-REPORT
  type: behavior
  title: Maintainers get a report of what visitors asked
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 2
  parent: CAP-LEARN-FROM-QUESTIONS
  links:
    governedBy: [RULE-ASK-NO-IDENTITY]
  availability:
    products: [PRD-INTENTSET]
    releases: [v0.1-draft]
    roles: [maintainer]
    editions: [hosted]
    flags: []
---

# Maintainers get a report of what visitors asked

## Behavior

A maintainer runs `pnpm run questions:report`, which reads the questions table, read-only, for the last 30 days (`--days`, up to the 90 the questions are kept) and writes a Markdown report: the period, the number of questions and conversations, the count of each outcome, the estimated cost, the reading of MEAS-QUESTIONS-ANSWERED, the questions grouped by the page their answer cited (those citing none as one group), every question the documentation did not answer with the first line of its answer, the contact requests, and the failures and refusals. With `--gaps` it writes instead a brief an agent drafts knowledge records from: the unanswered questions, the same question asked twice counted as one group, and the procedure ("Learning from questions" in CLAUDE.md). Conversations whose id starts with a check's prefix are left out (`--exclude-prefix`, by default `live-test-`, `local-check-`, `launch-check-` and `hang-check-`).

## Preconditions

AWS credentials that can read the questions table, from the default chain: `--profile`, else `AWS_PROFILE`, else the `coral-reef` profile when no keys are in the environment.

## Outcomes

Success: the report, on standard output, or in the file `--out` names; the questions are visitor data, so nothing is written into the repository by default, and an `--out` inside it is warned about. Failure: without credentials or access the report says so in one line, writes nothing, and exits 1.

## Sources

- The chat proposal and its decisions, 2026-10-09: the implementation tracker for the chat on intentset.org.
