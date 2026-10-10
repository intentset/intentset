---
markset: 0
intentset:
  spec: '0.1'
  profile: intentset/measure/0.1
  id: MEAS-REVIEW-THE-PRODUCT
  type: measure
  title: Reviewers who judge a change from its records
  status: draft
  owner: maintainers
  visibility: public
  audiences: [engineering, product]
  revision: 1
  parent: OUT-REVIEW-THE-PRODUCT
  measure:
    metric: reviews_from_records_share
    baseline: unknown
    target: 'Not set: the maintainers set it once the first reading is taken'
    window: 'Once in the 90 days after v0.1-draft, then each quarter'
    source: reviewer-survey
    direction: increase
---

# Reviewers who judge a change from its records

## Method

Not measured yet, and the survey does not exist. The reading is the share of people who review changes in a
repository that keeps a model who say that, for their last few reviews, they judged what the change does to the
product from its records and `intentset review` output rather than from the diff alone. A maintainer sends the short
survey to those reviewers; the first reading is the baseline, which is unknown until it is taken, and the target waits
for it.

A survey reports what reviewers say, not what they did: it is untrustworthy with few respondents, when only the
reviewers already keen on the model answer, or when the question leads. The adoption log's record of what the checks
caught is read beside it as evidence of use, not as this measure.
