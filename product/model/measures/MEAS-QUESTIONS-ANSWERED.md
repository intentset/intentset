---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/measure/0.1
  id: MEAS-QUESTIONS-ANSWERED
  type: measure
  title: Share of the chat's questions answered with a cited source
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: OUT-QUESTIONS-ANSWERED
  measure:
    metric: questions_answered_share
    baseline: unknown
    target: 'baseline first: set from the first 30 days after the launch, then held or raised'
    window: 'the last 30 days, read monthly from the chat''s launch on intentset.org, 2026-10-09'
    source: chat-questions
    direction: increase
---

# Share of the chat's questions answered with a cited source

## Method

The questions report (`pnpm run questions:report`, BEH-QUESTIONS-REPORT) reads the questions the chat keeps for 90 days and prints the reading as its Measure line: the questions whose outcome is `answered`, over those whose outcome is `answered` or `uncited`. `answered` means the answer cited at least one published page; `uncited` means it cited none, which is how a gap in the documentation shows. Contact requests are left out, because sending a visitor to the get-involved page is not a question the documentation was asked to answer; so are the model's refusals and failures, which say nothing about the documentation and which the report counts in sections of their own. The conversations of the maintainers' own checks are left out by their id prefixes, the report's default.

A maintainer runs the report monthly with `--days 30` and reads the line. The reading is untrustworthy when the window holds few questions (a handful of visitors moves it by tens of points), when the excluded prefixes miss a check's conversations, when a change to the prompt or the corpus changes how often the model cites rather than what the documentation covers, or when an off-topic question is answered without a citation: the report lists every uncited question so a person can tell the two apart. The baseline is unknown because the chat launched on 2026-10-09; the first 30 days' reading becomes it, and the target is set then.
