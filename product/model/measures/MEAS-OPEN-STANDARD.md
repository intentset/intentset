---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/measure/0.1
  id: MEAS-OPEN-STANDARD
  type: measure
  title: Other implementations checked against the published suite
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: OUT-OPEN-STANDARD
  measure:
    metric: other_implementations_conforming
    baseline: unknown
    target: 'Proposed, for the maintainers to confirm: at least one implementation other than this one'
    window: '12 months after v0.1-draft'
    source: conformance-claims
    direction: increase
---

# Other implementations checked against the published suite

## Method

Not measured yet. The reading is the number of implementations of the specifications, other than this repository's,
that report a run of `@intentset/conformance-suite` naming the suite's version, each section it ran and its result. A
maintainer counts the reports received, by issue or pull request on this repository or in a published conformance
report, at the end of the window. The baseline is recorded as unknown rather than zero, because no one has yet looked
for implementations that have not reported.

A report is a claim, not evidence of conformance: a count is untrustworthy if it includes a report that does not name
the suite's version, ran only some sections without saying so, or cannot be rerun from what it names. Passing and
failing reports are counted apart, and a partial run as partial.
